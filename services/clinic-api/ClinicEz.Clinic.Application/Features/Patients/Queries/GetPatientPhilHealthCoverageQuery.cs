using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Workspace;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Queries;

public sealed record GetPatientPhilHealthCoverageQuery(Guid PatientId, int? Year = null) : IRequest<PatientPhilHealthCoverageDto>;

public sealed class GetPatientPhilHealthCoverageQueryHandler : IRequestHandler<GetPatientPhilHealthCoverageQuery, PatientPhilHealthCoverageDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientPhilHealthMembership> _membershipRepo;
    private readonly IRepository<PatientYakapEnlistment> _enlistmentRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly IRepository<PatientIdentityVerification>? _verificationRepo;
    private readonly IRepository<YakapSubmission>? _submissionRepo;

    public GetPatientPhilHealthCoverageQueryHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientPhilHealthMembership> membershipRepo,
        IRepository<PatientYakapEnlistment> enlistmentRepo,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        IRepository<FacilitySettings>? settingsRepo = null,
        IRepository<PatientIdentityVerification>? verificationRepo = null,
        IRepository<YakapSubmission>? submissionRepo = null)
    {
        _patientRepo = patientRepo;
        _membershipRepo = membershipRepo;
        _enlistmentRepo = enlistmentRepo;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
        _settingsRepo = settingsRepo;
        _verificationRepo = verificationRepo;
        _submissionRepo = submissionRepo;
    }

    public async Task<PatientPhilHealthCoverageDto> Handle(GetPatientPhilHealthCoverageQuery request, CancellationToken cancellationToken)
    {
        if (request.PatientId == Guid.Empty)
        {
            throw new BadRequestException("PatientId is required.");
        }

        var patient = await _patientRepo
            .Query(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId)
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' was not found in this clinic.");
        }

        var membership = await _membershipRepo
            .Query(m => m.PatientId == request.PatientId && m.ClinicId == _clinicContext.ClinicId)
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken);

        PatientPhilHealthMembershipDto? membershipDto = null;
        if (membership != null)
        {
            var resolvedPin = !string.IsNullOrWhiteSpace(patient.PhilHealthNumber)
                ? patient.PhilHealthNumber.Trim()
                : (string.IsNullOrWhiteSpace(membership.MemberPin) ? null : membership.MemberPin.Trim());

            membershipDto = new PatientPhilHealthMembershipDto(
                Id: membership.Id,
                MemberType: membership.MemberType.ToString(),
                DependentRelationship: membership.DependentRelationship?.ToString(),
                PhilHealthPin: resolvedPin,
                PrincipalMemberPin: membership.PrincipalMemberPin,
                PrincipalLastName: membership.PrincipalLastName,
                PrincipalFirstName: membership.PrincipalFirstName,
                PrincipalMiddleName: membership.PrincipalMiddleName,
                PrincipalSuffix: membership.PrincipalSuffix,
                PrincipalDateOfBirth: membership.PrincipalDateOfBirth,
                PrincipalSex: membership.PrincipalSex?.ToString(),
                MembershipCategoryCode: membership.MembershipCategoryCode,
                MembershipCategoryDesc: membership.MembershipCategoryDesc,
                EmployerPin: membership.EmployerPin,
                EmployerName: membership.EmployerName,
                DefaultWalkInAtc: membership.DefaultWalkInAtc,
                PatientId: membership.PatientId,
                MemberPin: resolvedPin,
                PrincipalMemberLandlineNumber: membership.PrincipalMemberLandlineNumber,
                PrincipalMemberMobileNumber: membership.PrincipalMemberMobileNumber,
                PrincipalMemberEmail: membership.PrincipalMemberEmail,
                UpdatedAtUtc: membership.UpdatedAt ?? membership.CreatedAt);
        }

        var enlistments = await _enlistmentRepo
            .Query(e => e.PatientId == request.PatientId && e.ClinicId == _clinicContext.ClinicId)
            .AsNoTracking()
            .OrderByDescending(e => e.EffectiveYear)
            .ThenByDescending(e => e.EnlistmentDate)
            .ToListAsync(cancellationToken);

        var enlistmentDtos = enlistments.Select(MapEnlistmentDto).ToList();

        var today = await ClinicTimeZoneResolver.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, cancellationToken, _settingsRepo);
        var targetYear = request.Year ?? today.Year;

        var yearEntry = enlistments.FirstOrDefault(e => e.EffectiveYear == targetYear);
        bool hasActiveEnlistment = yearEntry != null && yearEntry.Status is
            YakapEnlistmentStatus.Active or
            YakapEnlistmentStatus.Registered or
            YakapEnlistmentStatus.Verified or
            YakapEnlistmentStatus.ProfilingCompleted or
            YakapEnlistmentStatus.Transmitted;

        bool isCompleted = yearEntry != null && (
            !string.IsNullOrWhiteSpace(yearEntry.ProfilingTransNo) ||
            yearEntry.ProfilingDate.HasValue ||
            yearEntry.Status is YakapEnlistmentStatus.ProfilingCompleted or YakapEnlistmentStatus.Transmitted);

        var fpeStatus = new CurrentYearFpeStatusDto(
            EffectiveYear: targetYear,
            HasActiveEnlistment: hasActiveEnlistment,
            EnlistmentId: yearEntry?.Id,
            IsCompleted: isCompleted,
            ProfilingDate: yearEntry?.ProfilingDate,
            ProfilingTransNo: yearEntry?.ProfilingTransNo,
            ProfilingAtc: yearEntry?.ProfilingAtc,
            SelectionControlNumber: yearEntry?.SelectionControlNumber,
            YesReferenceNo: yearEntry?.YesReferenceNo,
            RegistrationStatusCode: yearEntry?.RegistrationStatusCode);

        PatientIdentityVerificationSummaryDto? latestVerificationDto = null;
        if (_verificationRepo != null)
        {
            var latestVerification = await _verificationRepo
                .Query(v => v.PatientId == request.PatientId && v.ClinicId == _clinicContext.ClinicId && !v.IsDeleted)
                .AsNoTracking()
                .OrderByDescending(v => v.VerifiedAtUtc ?? v.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            if (latestVerification != null)
            {
                bool isVerifiedToday = latestVerification.VerifiedAtUtc.HasValue &&
                    (latestVerification.VerifiedManilaDate == today || latestVerification.VerificationDate == today);
                latestVerificationDto = new PatientIdentityVerificationSummaryDto(
                    Id: latestVerification.Id,
                    Mode: latestVerification.Mode.ToString(),
                    VerificationDate: latestVerification.VerificationDate,
                    IsVerifiedForToday: isVerifiedToday,
                    PcuTransactionId: latestVerification.PcuTransactionId,
                    PcuStatus: latestVerification.PcuResultCode,
                    OtpStatus: latestVerification.OtpValidationStatus,
                    ValidIdTypeCode: latestVerification.ValidIdTypeCode,
                    VerifiedAtUtc: latestVerification.VerifiedAtUtc);
            }
        }

        PatientYakapSubmissionSummaryDto? latestSubmissionDto = null;
        if (_submissionRepo != null)
        {
            var latestSub = await _submissionRepo
                .Query(s => s.PatientId == request.PatientId &&
                            s.ClinicId == _clinicContext.ClinicId &&
                            s.SubmissionType == YakapSubmissionType.Fpe &&
                            !s.IsDeleted)
                .AsNoTracking()
                .OrderByDescending(s => s.SubmittedAtUtc ?? s.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            if (latestSub != null)
            {
                latestSubmissionDto = new PatientYakapSubmissionSummaryDto(
                    Id: latestSub.Id,
                    SubmissionType: latestSub.SubmissionType.ToString(),
                    LocalTransactionNo: latestSub.LocalTransactionNo,
                    UploadTransactionNo: latestSub.UploadTransactionNo,
                    YesReferenceNo: latestSub.YesReferenceNo ?? yearEntry?.YesReferenceNo,
                    ProcessingStatus: latestSub.ProcessingStatus.ToString(),
                    SubmittedAtUtc: latestSub.SubmittedAtUtc,
                    CompletedAtUtc: latestSub.CompletedAtUtc,
                    LastErrorMessage: latestSub.LastErrorMessage);
            }
        }

        return new PatientPhilHealthCoverageDto(
            PatientId: patient.Id,
            PhilHealthNumber: patient.PhilHealthNumber,
            Membership: membershipDto,
            Enlistments: enlistmentDtos,
            CurrentYearFpeStatus: fpeStatus,
            LatestIdentityVerification: latestVerificationDto,
            LatestFpeSubmission: latestSubmissionDto);
    }

    internal static PatientYakapEnlistmentDto MapEnlistmentDto(PatientYakapEnlistment e) =>
        new(
            Id: e.Id,
            EffectiveYear: e.EffectiveYear,
            Status: e.Status.ToString(),
            Source: e.Source.ToString(),
            PackageType: e.PackageType.ToString(),
            EnlistmentDate: e.EnlistmentDate,
            ValidUntil: e.ValidUntil,
            CaseNo: e.CaseNo,
            ProfilingTransNo: e.ProfilingTransNo,
            ProfilingDate: e.ProfilingDate,
            ProfilingAtc: e.ProfilingAtc,
            IsWalkedIn: e.IsWalkedIn,
            HasPatientConsent: e.HasPatientConsent,
            ConsentSignedAtUtc: e.ConsentSignedAtUtc,
            CreatedByStaffId: e.CreatedByStaffId,
            CreatedByStaffName: e.CreatedByStaffName,
            PatientId: e.PatientId,
            HciAccreditationNumber: string.IsNullOrWhiteSpace(e.HciAccreditationNumber) ? null : e.HciAccreditationNumber,
            SelectionControlNumber: e.SelectionControlNumber,
            YesReferenceNo: e.YesReferenceNo,
            RegistrationStatusCode: e.RegistrationStatusCode,
            EmpanelmentMethod: e.EmpanelmentMethod,
            IdentityVerificationId: e.IdentityVerificationId,
            McaFlag: e.McaFlag,
            ProfilingTime: e.ProfilingTime,
            FpeClassificationType: e.FpeClassificationType,
            ServiceDeliveryMethod: e.ServiceDeliveryMethod,
            FacilitatorType: e.FacilitatorType,
            FacilitatorName: e.FacilitatorName,
            HasCoPayment: e.HasCoPayment,
            CoPaymentDate: e.CoPaymentDate,
            CoPaymentAmount: e.CoPaymentAmount,
            CoPaymentBalance: e.CoPaymentBalance,
            Remarks: e.Remarks);
}
