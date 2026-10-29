using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Settings.Commands;

public sealed record PublishClinicToDirectoryCommand(bool IsPublished) : IRequest<ClinicPublishingResultDto>;

public sealed record ClinicPublishingResultDto(
    bool Success,
    bool IsPublished,
    string Message
);

public sealed class PublishClinicToDirectoryCommandHandler : IRequestHandler<PublishClinicToDirectoryCommand, ClinicPublishingResultDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IRepository<ServiceItem> _servicesRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IInteropPublisher _interopPublisher;

    public PublishClinicToDirectoryCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IRepository<StaffMember> staffRepo,
        IRepository<ServiceItem> servicesRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork,
        IInteropPublisher interopPublisher)
    {
        _settingsRepo = settingsRepo;
        _staffRepo = staffRepo;
        _servicesRepo = servicesRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
        _interopPublisher = interopPublisher;
    }

    public async Task<ClinicPublishingResultDto> Handle(PublishClinicToDirectoryCommand request, CancellationToken ct)
    {
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct);
        if (settings == null)
        {
            throw new InvalidOperationException("Clinic settings must be initialized before publishing.");
        }

        var activeDoctors = await _staffRepo.Query()
            .Where(s => s.IsActive && s.Role == StaffRole.Doctor && !string.IsNullOrWhiteSpace(s.PrcLicenseNumber))
            .OrderBy(s => s.LastName)
            .ToListAsync(ct);

        var activeServices = await _servicesRepo.Query()
            .Where(s => s.IsActive)
            .OrderBy(s => s.Name)
            .ToListAsync(ct);

        if (request.IsPublished)
        {
            // Enforce pre-flight readiness checklist
            var missingChecks = new List<string>();
            if (!settings.IsWorkspaceEligible)
                missingChecks.Add("Facility has not been granted workspace eligibility for patient app directory publishing in Portal");

            if (string.IsNullOrWhiteSpace(settings.OperatingHours))
                missingChecks.Add("Operating hours must be configured");

            if (activeDoctors.Count == 0)
                missingChecks.Add("At least one active licensed doctor with PRC license number is required");

            if (activeServices.Count == 0)
                missingChecks.Add("At least one active clinic service must be published in the fee schedule");

            if (missingChecks.Count > 0)
            {
                throw new InvalidOperationException(
                    $"Cannot publish clinic to directory: readiness checks failed. {string.Join("; ", missingChecks)}.");
            }

            settings.IsDirectoryPublished = true;
        }
        else
        {
            settings.IsDirectoryPublished = false;
        }

        settings.UpdatedAt = DateTime.UtcNow;

        // Map providers for directory payload
        var providerDtos = activeDoctors.Select((d, idx) => new FacilityProviderDto(
            Id: d.Id,
            Name: $"Dr. {d.FirstName} {d.LastName}".Trim(),
            Specialty: !string.IsNullOrWhiteSpace(d.Specialty) ? d.Specialty : "General Practice",
            ProfessionalLicenseNo: d.PrcLicenseNumber,
            IsActive: true,
            DisplayOrder: idx
        )).ToList();

        // Map services for directory payload
        var serviceDtos = activeServices.Select(s => new ClinicServiceDto(
            ServiceId: s.Id,
            Name: s.Name,
            Category: s.Category,
            StandardPrice: s.StandardPrice,
            IsActive: s.IsActive
        )).ToList();

        // Dynamic mapping based on FacilitySettings.SpecialtyMode
        var classification = settings.SpecialtyMode?.Trim().ToLowerInvariant() switch
        {
            "dental" => "Dental Clinic",
            "multispecialty" or "multi-specialty" => "Multi-Specialty Clinic",
            "medical" => "Ambulatory Clinic",
            _ => "Ambulatory Clinic"
        };

        // Enqueue facility.directory.updated to patient-api via Outbox
        var directoryEvent = new FacilityCreatedEvent
        {
            TenantId = settings.TenantId,
            TenantSlug = settings.TenantSlug,
            FacilityType = FacilityType.Clinic,
            ResourceId = settings.ClinicId,
            Name = settings.ClinicName,
            Slug = settings.FacilitySlug,
            OperatingHours = settings.OperatingHours,
            Address = settings.LetterheadAddress,
            ContactNumber = settings.LetterheadContact,
            Classification = classification,
            IsPhilHealthAccredited = settings.IsPhilHealthConfigured,
            IsDirectoryPublished = settings.IsDirectoryPublished,
            IsWorkspaceEligible = settings.IsWorkspaceEligible,
            IsPublic = settings.IsWorkspaceEligible && settings.IsDirectoryPublished,
            IsBookingPaused = settings.IsOnlineBookingPaused,
            IsJoinGated = settings.IsJoinEnabled && !string.IsNullOrWhiteSpace(settings.JoinCode),
            JoinCode = settings.JoinCode,
            Providers = providerDtos,
            Services = serviceDtos
        };

        var from = Party.ForFacility(settings.TenantId, settings.ClinicId.ToString(), FacilityType.Clinic);
        var to = new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient };

        _interopPublisher.Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            from,
            to,
            settings.ClinicId,
            directoryEvent);

        await _unitOfWork.SaveChangesAsync(ct);

        return new ClinicPublishingResultDto(
            Success: true,
            IsPublished: settings.IsDirectoryPublished,
            Message: settings.IsDirectoryPublished
                ? "Clinic successfully published to the consumer patient directory."
                : "Clinic unpublished from the consumer patient directory."
        );
    }
}
