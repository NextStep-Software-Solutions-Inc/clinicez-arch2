using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.Common;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Workspace;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Yakap.Queries;

/// <summary>
/// Verifies a PhilHealth PIN by checking BOTH:
/// 1) 12-digit Modulus-11 sequence validity, and
/// 2) Live PhilHealth registry/standing confirmation via PCAPI v2.0 Service 02.
/// </summary>
public sealed record VerifyPhilHealthPinQuery(
    string Pin,
    Guid? ExcludePatientId = null,
    bool CheckClinicUniqueness = true) : IRequest<PinVerificationResultDto>;

public sealed class VerifyPhilHealthPinQueryHandler : IRequestHandler<VerifyPhilHealthPinQuery, PinVerificationResultDto>
{
    private readonly IYakapPcapiClient _pcapiClient;
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly IRepository<Patient>? _patientRepo;
    private readonly IRepository<PatientPhilHealthMembership>? _membershipRepo;

    public VerifyPhilHealthPinQueryHandler(
        IYakapPcapiClient pcapiClient,
        IRepository<FacilitySettings> settingsRepo,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        IRepository<Patient>? patientRepo = null,
        IRepository<PatientPhilHealthMembership>? membershipRepo = null)
    {
        _pcapiClient = pcapiClient;
        _settingsRepo = settingsRepo;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
        _patientRepo = patientRepo;
        _membershipRepo = membershipRepo;
    }

    public async Task<PinVerificationResultDto> Handle(VerifyPhilHealthPinQuery request, CancellationToken ct)
    {
        var formattedPin = PhilHealthPinNormalizer.FormatHyphenated(request.Pin);
        if (!PhilHealthPinNormalizer.IsValidMod11Pin(request.Pin))
        {
            return new PinVerificationResultDto(
                IsValid: false,
                FormattedPin: formattedPin,
                IsSequenceValid: false,
                IsPhilHealthVerified: false,
                MemberName: null,
                FailureReason: "Enter a complete 12-digit PhilHealth PIN with a valid check digit.",
                IsServerError: false);
        }

        // Check clinic-level PIN uniqueness for patient PINs (skipped when verifying a Principal Sponsor PIN)
        var conflict = request.CheckClinicUniqueness
            ? await YakapWorkflowHelpers.FindExistingPinOwnerAsync(
                _patientRepo,
                _membershipRepo,
                _clinicContext.ClinicId,
                request.Pin,
                request.ExcludePatientId,
                ct)
            : null;
        if (conflict != null)
        {
            var codeSuffix = string.IsNullOrWhiteSpace(conflict.PatientCode) ? string.Empty : $" ({conflict.PatientCode})";
            return new PinVerificationResultDto(
                IsValid: false,
                FormattedPin: formattedPin,
                IsSequenceValid: true,
                IsPhilHealthVerified: false,
                MemberName: null,
                FailureReason: $"PhilHealth PIN is already assigned to another patient: {conflict.FullName}{codeSuffix}.",
                IsServerError: false,
                IsUniqueInClinic: false,
                ConflictingPatientName: conflict.FullName,
                ConflictingPatientCode: conflict.PatientCode);
        }

        var normalizedPin = PhilHealthPinNormalizer.Normalize(request.Pin) ?? request.Pin.Trim();
        var today = await YakapWorkflowHelpers.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, _settingsRepo, ct);

        ApiResponse<YakapValidatorResponse> standingResponse;
        try
        {
            standingResponse = await _pcapiClient.ValidateStandingAsync(
                new YakapValidateStandingRequest(normalizedPin, today.Year.ToString(), Consent: true),
                ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            return new PinVerificationResultDto(
                IsValid: false,
                FormattedPin: formattedPin,
                IsSequenceValid: true,
                IsPhilHealthVerified: false,
                MemberName: null,
                FailureReason: "Unable to reach PhilHealth verification service right now.",
                IsServerError: true);
        }

        if (!standingResponse.Succeeded || standingResponse.Data == null)
        {
            var isServerError = IsVerificationServerError(standingResponse.ErrorCode, standingResponse.Message);
            return new PinVerificationResultDto(
                IsValid: false,
                FormattedPin: formattedPin,
                IsSequenceValid: true,
                IsPhilHealthVerified: false,
                MemberName: null,
                FailureReason: string.IsNullOrWhiteSpace(standingResponse.Message)
                    ? (isServerError
                        ? "PhilHealth verification service is unavailable right now."
                        : "PIN could not be verified in PhilHealth records.")
                    : standingResponse.Message,
                IsServerError: isServerError);
        }

        var nameParts = new[] { standingResponse.Data.PatientLname, standingResponse.Data.PatientFname }
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s!.Trim());
        var memberName = string.Join(", ", nameParts);

        return new PinVerificationResultDto(
            IsValid: true,
            FormattedPin: formattedPin,
            IsSequenceValid: true,
            IsPhilHealthVerified: true,
            MemberName: string.IsNullOrWhiteSpace(memberName) ? null : memberName,
            FailureReason: null,
            IsServerError: false);
    }

    private static bool IsVerificationServerError(string? errorCode, string? message)
    {
        if (!string.IsNullOrWhiteSpace(errorCode))
        {
            var code = errorCode.Trim().ToUpperInvariant();
            if (code is "PHILHEALTH_CONNECTION_URL_MISSING" or "PHILHEALTH_CONNECTION_URL_INVALID"
                or "PHILHEALTH_ENDPOINT_NOT_FOUND" or "PHILHEALTH_AUTH_FAILED")
            {
                return false;
            }
            if (code is "SERVICE_UNAVAILABLE" or "TIMEOUT" or "UPSTREAM_SERVER_ERROR" or "UPSTREAM_UNREADABLE"
                or "PHILHEALTH_SERVER_UNREACHABLE" or "RATE_LIMITED" or "429"
                || code.StartsWith("HTTP_5", StringComparison.Ordinal))
            {
                return true;
            }
            if (code is "PIN_NOT_FOUND" or "PIN_INVALID" or "HTTP_400" or "HTTP_404" or "HTTP_422")
            {
                return false;
            }
        }

        if (string.IsNullOrWhiteSpace(message))
        {
            return false;
        }

        var msg = message.ToLowerInvariant();
        return msg.Contains("did not answer in time", StringComparison.Ordinal)
            || msg.Contains("timed out", StringComparison.Ordinal)
            || msg.Contains("not been connected", StringComparison.Ordinal)
            || msg.Contains("could not be read", StringComparison.Ordinal)
            || msg.Contains("empty response", StringComparison.Ordinal)
            || msg.Contains("unavailable", StringComparison.Ordinal)
            || msg.Contains("server error", StringComparison.Ordinal)
            || msg.Contains("unreachable", StringComparison.Ordinal)
            || msg.Contains("rate limit", StringComparison.Ordinal);
    }
}
