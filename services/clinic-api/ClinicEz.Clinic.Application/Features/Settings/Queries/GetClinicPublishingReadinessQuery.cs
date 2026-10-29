using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
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
    bool IsWorkspaceEligible = false
);

public sealed record ClinicPublishingChecksDto(
    bool HasOperatingHours,
    bool HasLicensedDoctors,
    bool HasActiveServices,
    bool HasLetterhead
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

        var licensedDoctorsCount = await _staffRepo.Query()
            .Where(s => s.IsActive
                        && s.Role == StaffRole.Doctor
                        && !string.IsNullOrWhiteSpace(s.PrcLicenseNumber))
            .CountAsync(ct);

        var hasLicensedDoctors = licensedDoctorsCount > 0;

        var activeServicesCount = await _servicesRepo.Query()
            .Where(s => s.IsActive)
            .CountAsync(ct);

        var hasActiveServices = activeServicesCount > 0;

        var hasLetterhead = !string.IsNullOrWhiteSpace(settings?.LetterheadAddress)
            || !string.IsNullOrWhiteSpace(settings?.LetterheadContact)
            || !string.IsNullOrWhiteSpace(settings?.LetterheadHeader);

        // Core publishing readiness criteria per requirements: Operating Hours, Licensed Doctors with PRC, Active Services
        var isReady = hasOperatingHours && hasLicensedDoctors && hasActiveServices;

        return new ClinicPublishingReadinessDto(
            IsReady: isReady,
            Checks: new ClinicPublishingChecksDto(
                HasOperatingHours: hasOperatingHours,
                HasLicensedDoctors: hasLicensedDoctors,
                HasActiveServices: hasActiveServices,
                HasLetterhead: hasLetterhead
            ),
            LicensedDoctorsCount: licensedDoctorsCount,
            ActiveServicesCount: activeServicesCount,
            OperatingHours: settings?.OperatingHours,
            IsWorkspaceEligible: settings?.IsWorkspaceEligible ?? false
        );
    }
}
