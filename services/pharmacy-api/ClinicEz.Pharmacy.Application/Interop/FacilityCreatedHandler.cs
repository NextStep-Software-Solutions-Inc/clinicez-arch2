using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Pharmacy.Application.Interop;

/// <summary>
/// <c>facility.license.issued</c>: the control plane provisions (or re-licenses) this pharmacy. Creates or updates the
/// local <see cref="PharmacySettings"/> (the facility profile and signed license) and acknowledges with
/// <c>facility.provisioned</c>. Idempotent: it upserts on the pharmacy id.
/// </summary>
public sealed class FacilityCreatedHandler : IInteropHandler<FacilityCreatedEvent>
{
    private readonly IRepository<PharmacySettings> _settingsRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPharmacyScopeSetter _scope;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<FacilityCreatedHandler> _logger;

    public FacilityCreatedHandler(
        IRepository<PharmacySettings> settingsRepo,
        IUnitOfWork unitOfWork,
        IPharmacyScopeSetter scope,
        IInteropPublisher publisher,
        ILogger<FacilityCreatedHandler> logger)
    {
        _settingsRepo = settingsRepo;
        _unitOfWork = unitOfWork;
        _scope = scope;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task HandleAsync(FacilityCreatedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        if (message.FacilityType != FacilityType.Pharmacy)
        {
            return;
        }

        if (context.From.Kind != PartyKind.ControlPlane)
        {
            _logger.LogWarning(
                "[ClinicEz.Pharmacy] Ignoring {Type} {MessageId}: only the control plane may provision a pharmacy (sender {Sender}).",
                context.Type, context.MessageId, context.From.Address);
            return;
        }

        var to = context.To;
        if (to.Kind != PartyKind.Facility
            || to.FacilityType is not null and not FacilityType.Pharmacy
            || !Guid.TryParse(to.FacilityId, out var pharmacyId)
            || pharmacyId == Guid.Empty
            || pharmacyId != message.ResourceId
            || string.IsNullOrWhiteSpace(to.TenantId)
            || to.TenantId != message.TenantId)
        {
            _logger.LogWarning(
                "[ClinicEz.Pharmacy] Ignoring {Type} {MessageId}: recipient {Recipient} does not match pharmacy {ResourceId} of tenant {TenantId}.",
                context.Type, context.MessageId, to.Address, message.ResourceId, message.TenantId);
            return;
        }

        _logger.LogInformation("[ClinicEz.Pharmacy] Provisioning Pharmacy: '{Name}' (ID: {ResourceId}) for Tenant {TenantId}",
            message.Name, message.ResourceId, message.TenantId);

        _scope.Enter(message.TenantId, pharmacyId);

        // Seed or update PharmacySettings with cryptographically rooted license token
        var existingSettings = await _settingsRepo.Query(s => s.PharmacyId == pharmacyId).FirstOrDefaultAsync(ct);

        if (existingSettings != null)
        {
            if (!string.IsNullOrWhiteSpace(message.LicenseToken))
            {
                existingSettings.LicenseToken = message.LicenseToken;
                existingSettings.PlanTier = message.PlanTier ?? "Community";
                existingSettings.MaxStaffLimit = message.Limits?.MaxStaff ?? 5;
                existingSettings.LicenseExpiresAt = message.LicenseExpiresAt;
            }
            existingSettings.PharmacyName = message.Name;
        }
        else
        {
            await _settingsRepo.AddAsync(new PharmacySettings
            {
                Id = Guid.NewGuid(),
                TenantId = message.TenantId,
                PharmacyId = pharmacyId,
                PharmacyName = message.Name,
                LicenseToken = message.LicenseToken,
                PlanTier = message.PlanTier ?? "Community",
                MaxStaffLimit = message.Limits?.MaxStaff ?? 5,
                LicenseExpiresAt = message.LicenseExpiresAt,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "SystemProvisioning"
            }, ct);
        }

        // Queued before the save so the acknowledgement commits atomically with the provisioning.
        _publisher.Enqueue(
            InteropTypes.FacilityProvisioned,
            Party.ForFacility(message.TenantId, pharmacyId.ToString(), FacilityType.Pharmacy),
            Party.Portal,
            message.ResourceId,
            new FacilityProvisionedEvent
            {
                ResourceId = message.ResourceId,
                TenantId = message.TenantId,
                Success = true,
                Message = $"Pharmacy dashboard successfully provisioned '{message.Name}'."
            });

        await _unitOfWork.SaveChangesAsync(ct);
    }
}
