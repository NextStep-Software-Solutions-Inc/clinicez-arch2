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

    public GetPatientPhilHealthCoverageQueryHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientPhilHealthMembership> membershipRepo,
        IRepository<PatientYakapEnlistment> enlistmentRepo,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        IRepository<FacilitySettings>? settingsRepo = null)
    {
        _patientRepo = patientRepo;
        _membershipRepo = membershipRepo;
        _enlistmentRepo = enlistmentRepo;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
        _settingsRepo = settingsRepo;
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
            ProfilingAtc: yearEntry?.ProfilingAtc);

        return new PatientPhilHealthCoverageDto(
            PatientId: patient.Id,
            PhilHealthNumber: patient.PhilHealthNumber,
            Membership: membershipDto,
            Enlistments: enlistmentDtos,
            CurrentYearFpeStatus: fpeStatus);
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
            EnlistmentTransNo: e.EnlistmentTransNo,
            ProfilingTransNo: e.ProfilingTransNo,
            ProfilingDate: e.ProfilingDate,
            ProfilingAtc: e.ProfilingAtc,
            IsWalkedIn: e.IsWalkedIn,
            HasPatientConsent: e.HasPatientConsent,
            ConsentSignedAtUtc: e.ConsentSignedAtUtc,
            CreatedByStaffId: e.CreatedByStaffId,
            CreatedByStaffName: e.CreatedByStaffName,
            EnlistmentTransDate: e.EnlistmentTransDate,
            PatientId: e.PatientId,
            HciAccreditationNumber: string.IsNullOrWhiteSpace(e.HciAccreditationNumber) ? null : e.HciAccreditationNumber,
            YesReferenceNo: e.YesReferenceNo,
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
