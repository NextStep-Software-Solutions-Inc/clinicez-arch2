using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.Commands;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Queries;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetEligibleYakapEncounters;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/yakap")]
public sealed class YakapTransmittalsController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IPhilHealthProxyClient _proxyClient;
    private readonly IYakapPcapiClient _pcapiClient;

    public YakapTransmittalsController(
        ISender sender,
        IPhilHealthProxyClient proxyClient,
        IYakapPcapiClient pcapiClient)
    {
        _sender = sender;
        _proxyClient = proxyClient;
        _pcapiClient = pcapiClient;
    }

    [HttpGet("encounters/eligible")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<List<EligibleYakapEncounterDto>>>> GetEligibleEncounters(
        [FromQuery] string reportTagging = "2",
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] Guid? patientId = null,
        [FromQuery] Guid? branchId = null,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetEligibleYakapEncountersQuery(reportTagging, startDate, endDate, patientId, branchId), ct);
        return Ok(result);
    }

    [HttpGet("pin/{pin}/validate")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<PinVerificationResultDto>>> ValidatePin(
        string pin,
        [FromQuery] Guid? excludePatientId = null,
        [FromQuery] bool checkUniqueness = true,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new VerifyPhilHealthPinQuery(pin, excludePatientId, checkUniqueness), ct);
        return Ok(result.IsValid
            ? ApiResponse<PinVerificationResultDto>.Success(result, "PhilHealth PIN sequence and registry record verified.")
            : ApiResponse<PinVerificationResultDto>.Success(result, result.FailureReason ?? "PhilHealth PIN verification failed."));
    }

    // ── Services 01, 02, 04, 07, 08: Patient Eligibility, Identity, Assignment & Confirmation Slip ──

    [HttpPost("patients/{patientId:guid}/validate-standing")]
    [HasAnyPermission(ClinicPermissions.PatientsRead, ClinicPermissions.PatientsWrite, ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<YakapStandingCheckDto>>> ValidatePatientStanding(
        Guid patientId,
        [FromBody] ValidateStandingApiRequest? request,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(
            new ValidatePatientYakapStandingCommand(patientId, request?.EffectiveYear, request?.Consent ?? true),
            ct);
        return Ok(ApiResponse<YakapStandingCheckDto>.Success(result, result.SummaryMessage));
    }

    [HttpPost("patients/{patientId:guid}/pcu/start")]
    [HasAnyPermission(ClinicPermissions.PatientsWrite, ClinicPermissions.TriageWrite, ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<YakapPcuStartResultDto>>> StartPcuSession(
        Guid patientId,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new StartPatientPcuSessionCommand(patientId), ct);
        return Ok(ApiResponse<YakapPcuStartResultDto>.Success(result));
    }

    [HttpPost("patients/{patientId:guid}/pcu/verify")]
    [HasAnyPermission(ClinicPermissions.PatientsWrite, ClinicPermissions.TriageWrite, ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<YakapIdentityVerificationDto>>> VerifyPcuSession(
        Guid patientId,
        [FromBody] VerifyPcuApiRequest? request,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(
            new VerifyPatientPcuSessionCommand(patientId, request?.VerificationId, request?.LivenessAuthorizationId),
            ct);
        return Ok(ApiResponse<YakapIdentityVerificationDto>.Success(result, "Patient face scan confirmed."));
    }

    [HttpPost("patients/{patientId:guid}/otp/validate")]
    [HasAnyPermission(ClinicPermissions.PatientsWrite, ClinicPermissions.TriageWrite, ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<YakapIdentityVerificationDto>>> ValidateOtp(
        Guid patientId,
        [FromBody] ValidateOtpApiRequest request,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(
            new ValidatePatientOtpCommand(patientId, request.OneTimePin, request.Consent),
            ct);
        return Ok(ApiResponse<YakapIdentityVerificationDto>.Success(result, "Text verification code confirmed."));
    }

    [HttpPost("patients/{patientId:guid}/valid-id")]
    [HasAnyPermission(ClinicPermissions.PatientsWrite, ClinicPermissions.TriageWrite, ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<YakapIdentityVerificationDto>>> RecordValidId(
        Guid patientId,
        [FromBody] RecordValidIdApiRequest request,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(
            new RecordValidIdVerificationCommand(patientId, request.ValidIdTypeCode, request.ValidIdNumber, request.AttachmentId, request.Consent),
            ct);
        return Ok(ApiResponse<YakapIdentityVerificationDto>.Success(result, "Photo ID identity check recorded."));
    }

    [HttpPost("patients/{patientId:guid}/select")]
    [HasAnyPermission(ClinicPermissions.PatientsWrite, ClinicPermissions.TriageWrite, ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<YakapSelectionResultDto>>> SubmitSelection(
        Guid patientId,
        [FromBody] SubmitSelectionApiRequest? request,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(
            new SubmitPatientYakapSelectionCommand(patientId, request?.SelectionDate, request?.Consent ?? true),
            ct);
        return Ok(ApiResponse<YakapSelectionResultDto>.Success(result, result.Message));
    }

    [HttpGet("patients/{patientId:guid}/availment-slip")]
    [HasAnyPermission(ClinicPermissions.PatientsRead, ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<AvailmentSlipResponse>>> GetAvailmentSlip(
        Guid patientId,
        [FromQuery] int? year = null,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetYakapAvailmentSlipQuery(patientId, year), ct);
        return Ok(ApiResponse<AvailmentSlipResponse>.Success(result));
    }

    // ── Services 03, 05, 06: Submissions, Polling, Retry & Masterlist Sync ──

    [HttpGet("submissions/summary")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<PortalYakapBranchSummaryDto>>> GetSubmissionsSummary(
        [FromQuery] Guid? branchId = null,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetYakapSubmissionsSummaryQuery(branchId), ct);
        return Ok(ApiResponse<PortalYakapBranchSummaryDto>.Success(result));
    }

    [HttpGet("submissions")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<List<PortalYakapSubmissionDto>>>> GetSubmissions(
        [FromQuery] string? status = null,
        [FromQuery] string? submissionType = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] Guid? branchId = null,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetYakapSubmissionsQuery(status, submissionType, page, pageSize, branchId), ct);
        return Ok(ApiResponse<List<PortalYakapSubmissionDto>>.Success(result));
    }

    [HttpPost("submissions/{id:guid}/poll")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<PortalYakapSubmissionDto>>> PollSubmissionStatus(
        Guid id,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new PollYakapSubmissionStatusCommand(id), ct);
        return Ok(ApiResponse<PortalYakapSubmissionDto>.Success(result));
    }

    [HttpPost("submissions/{id:guid}/retry")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<PortalYakapSubmissionDto>>> RetrySubmission(
        Guid id,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new RetryYakapSubmissionCommand(id), ct);
        return Ok(ApiResponse<PortalYakapSubmissionDto>.Success(result));
    }

    [HttpPost("masterlist/sync")]
    [HasPermission(ClinicPermissions.YakapRead)]
    public async Task<ActionResult<ApiResponse<PortalYakapMasterlistSyncResultDto>>> SyncMasterlist(
        [FromBody] SyncMasterlistApiRequest? request,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(
            new SyncYakapMasterlistCommand(
                request?.PatientPin,
                request?.EffectiveYear,
                request?.StartDate,
                request?.EndDate,
                request?.BranchId),
            ct);
        return Ok(ApiResponse<PortalYakapMasterlistSyncResultDto>.Success(result, result.Message));
    }

    // ── PCAPI Sandbox Simulation Controls (Development / Demo) ──

    [HttpGet("sandbox/status")]
    [TypeFilter(typeof(SimulationEnabledFilter))]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<SandboxStatus>>> GetSandboxStatus(CancellationToken ct)
    {
        return Ok(await _pcapiClient.GetSandboxStatusAsync(ct));
    }

    [HttpPost("sandbox/scenario")]
    [TypeFilter(typeof(SimulationEnabledFilter))]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<SandboxStatus>>> SetSandboxScenario(
        [FromBody] SetSandboxScenarioRequest request,
        CancellationToken ct)
    {
        return Ok(await _pcapiClient.SetSandboxScenarioAsync(request, ct));
    }

    [HttpPost("sandbox/reset")]
    [TypeFilter(typeof(SimulationEnabledFilter))]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<SandboxStatus>>> ResetSandbox(CancellationToken ct)
    {
        return Ok(await _pcapiClient.ResetSandboxAsync(ct));
    }
}

public sealed record ValidateStandingApiRequest(int? EffectiveYear = null, bool Consent = true);
public sealed record VerifyPcuApiRequest(Guid? VerificationId = null, string? LivenessAuthorizationId = null);
public sealed record ValidateOtpApiRequest(string OneTimePin, bool Consent = true);
public sealed record RecordValidIdApiRequest(string ValidIdTypeCode, string? ValidIdNumber = null, Guid? AttachmentId = null, bool Consent = true);
public sealed record SubmitSelectionApiRequest(DateOnly? SelectionDate = null, bool Consent = true);
public sealed record SyncMasterlistApiRequest(string? PatientPin = null, int? EffectiveYear = null, DateOnly? StartDate = null, DateOnly? EndDate = null, Guid? BranchId = null);
