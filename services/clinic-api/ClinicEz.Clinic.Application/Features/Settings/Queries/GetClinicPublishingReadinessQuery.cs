using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Queries;

public sealed record GetClinicPublishingReadinessQuery : IRequest<ClinicPublishingReadinessDto>;

public sealed record ClinicPublishingReadinessDto(
    bool IsReady,
    ClinicPublishingChecksDto Checks,
    int LicensedDoctorsCount,
    int ActiveServicesCount,
    string? OperatingHours,
    bool IsWorkspaceEligible = false,
    PlatformVerificationStatus PlatformVerificationStatus = PlatformVerificationStatus.Unverified,
    string? VerificationRejectionReason = null,
    DateTime? LastVerificationSubmittedAtUtc = null,
    string? LetterheadDohLto = null,
    string? LtoEvidenceObjectKey = null,
    bool IsOnlineBookingPaused = false,
    bool IsDirectoryPublished = false,
    int OptedInDoctorsCount = 0,
    int OptedInDoctorsReadyCount = 0,
    int OptedInNursesCount = 0,
    int OptedInNursesReadyCount = 0,
    int OptedInCliniciansCount = 0,
    int OptedInCliniciansReadyCount = 0
);

public sealed record ClinicPublishingChecksDto(
    bool HasOperatingHours,
    bool HasLicensedDoctors,
    bool HasActiveServices,
    bool HasLetterhead,
    bool HasDohLtoOrProof = false
);

public sealed class GetClinicPublishingReadinessQueryHandler : IRequestHandler<GetClinicPublishingReadinessQuery, ClinicPublishingReadinessDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IRepository<ServiceItem> _servicesRepo;
    private readonly IClinicContext _clinicContext;

    public GetClinicPublishingReadinessQueryHandler(
        IRepository<FacilitySettings> settingsRepo,
        IRepository<StaffMember> staffRepo,
        IRepository<ServiceItem> servicesRepo,
        IClinicContext clinicContext)
    {
        _settingsRepo = settingsRepo;
        _staffRepo = staffRepo;
        _servicesRepo = servicesRepo;
        _clinicContext = clinicContext;
    }

    public async Task<ClinicPublishingReadinessDto> Handle(GetClinicPublishingReadinessQuery request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query()
            .FirstOrDefaultAsync(ct);

        var hasOperatingHours = !string.IsNullOrWhiteSpace(settings?.OperatingHours);

        var activeStaff = await _staffRepo.Query()
            .Where(s => s.IsActive && !s.IsDeleted)
            .ToListAsync(ct);

        var licensedDoctorsCount = activeStaff.Count(s =>
            s.Role == StaffRole.Doctor
            && !string.IsNullOrWhiteSpace(s.PrcLicenseNumber));

        var hasLicensedDoctors = licensedDoctorsCount > 0;

        var activeServicesCount = await _servicesRepo.Query()
            .Where(s => s.IsActive)
            .CountAsync(ct);

        var hasActiveServices = activeServicesCount > 0;

        var hasLetterhead = !string.IsNullOrWhiteSpace(settings?.LetterheadAddress)
            || !string.IsNullOrWhiteSpace(settings?.LetterheadContact)
            || !string.IsNullOrWhiteSpace(settings?.LetterheadHeader);

        var hasDohLtoOrProof = !string.IsNullOrWhiteSpace(settings?.LetterheadDohLto)
            || !string.IsNullOrWhiteSpace(settings?.LtoEvidenceObjectKey);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var optedInDoctors = activeStaff.Where(s => s.Role == StaffRole.Doctor && s.IsDirectoryOptIn).ToList();
        var optedInNurses = activeStaff.Where(s => s.Role == StaffRole.Nurse && s.IsDirectoryOptIn).ToList();

        var optedInDoctorsReadyCount = optedInDoctors.Count(s =>
            ClinicianDirectoryValidationHelper.IsClinicianVerificationReady(
                s.Role, s.IsActive, s.PrcLicenseNumber, s.PrcExpiryDate, s.PrcEvidenceObjectKey, s.VerificationContact, today));
        var optedInNursesReadyCount = optedInNurses.Count(s =>
            ClinicianDirectoryValidationHelper.IsClinicianVerificationReady(
                s.Role, s.IsActive, s.PrcLicenseNumber, s.PrcExpiryDate, s.PrcEvidenceObjectKey, s.VerificationContact, today));

        var isReady = hasOperatingHours && hasLicensedDoctors && hasActiveServices && hasDohLtoOrProof;

        return new ClinicPublishingReadinessDto(
            IsReady: isReady,
            Checks: new ClinicPublishingChecksDto(
                HasOperatingHours: hasOperatingHours,
                HasLicensedDoctors: hasLicensedDoctors,
                HasActiveServices: hasActiveServices,
                HasLetterhead: hasLetterhead,
                HasDohLtoOrProof: hasDohLtoOrProof
            ),
            LicensedDoctorsCount: licensedDoctorsCount,
            ActiveServicesCount: activeServicesCount,
            OperatingHours: settings?.OperatingHours,
            IsWorkspaceEligible: settings?.IsWorkspaceEligible ?? false,
            PlatformVerificationStatus: settings?.PlatformVerificationStatus ?? PlatformVerificationStatus.Unverified,
            VerificationRejectionReason: settings?.VerificationRejectionReason,
            LastVerificationSubmittedAtUtc: settings?.LastVerificationSubmittedAtUtc,
            LetterheadDohLto: settings?.LetterheadDohLto,
            LtoEvidenceObjectKey: settings?.LtoEvidenceObjectKey,
            IsOnlineBookingPaused: settings?.IsOnlineBookingPaused ?? false,
            IsDirectoryPublished: settings?.IsDirectoryPublished ?? false,
            OptedInDoctorsCount: optedInDoctors.Count,
            OptedInDoctorsReadyCount: optedInDoctorsReadyCount,
            OptedInNursesCount: optedInNurses.Count,
            OptedInNursesReadyCount: optedInNursesReadyCount,
            OptedInCliniciansCount: optedInDoctors.Count + optedInNurses.Count,
            OptedInCliniciansReadyCount: optedInDoctorsReadyCount + optedInNursesReadyCount
        );
    }
}
