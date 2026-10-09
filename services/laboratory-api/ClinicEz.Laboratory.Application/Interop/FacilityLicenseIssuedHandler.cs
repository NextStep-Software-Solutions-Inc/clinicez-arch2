using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Application.Interop;

/// <summary>
/// <c>facility.license.issued</c>: seeds or refreshes the laboratory's local profile (<see cref="LabSettings"/>) from
/// the license the portal issued. The profile and the <c>facility.provisioned</c> acknowledgement are saved in
/// one transaction. Idempotent: a redelivery refreshes the same settings row.
/// </summary>
public sealed class FacilityLicenseIssuedHandler : IInteropHandler<FacilityCreatedEvent>
{
    private readonly IRepository<LabSettings> _settingsRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILabContext _labContext;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<FacilityLicenseIssuedHandler> _logger;

    public FacilityLicenseIssuedHandler(
        IRepository<LabSettings> settingsRepository,
        IUnitOfWork unitOfWork,
        ILabContext labContext,
        IInteropPublisher publisher,
        ILogger<FacilityLicenseIssuedHandler> logger)
    {
        _settingsRepository = settingsRepository;
        _unitOfWork = unitOfWork;
        _labContext = labContext;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task HandleAsync(FacilityCreatedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        if (message.FacilityType != FacilityType.Laboratory)
        {
            return;
        }

        if (context.From.Kind != PartyKind.ControlPlane)
        {
            _logger.LogWarning(
                "[ClinicEz.Laboratory] Ignoring facility.license.issued {MessageId}: sender {Sender} is not the control plane.",
                context.MessageId, context.From.Address);
            return;
        }

        if (!IsAddressedTo(context.To, message))
        {
            _logger.LogWarning(
                "[ClinicEz.Laboratory] Ignoring facility.license.issued {MessageId}: addressed to {Recipient}, not to laboratory {ResourceId} of tenant {TenantId}.",
                context.MessageId, context.To.Address, message.ResourceId, message.TenantId);
            return;
        }

        _logger.LogInformation(
            "[ClinicEz.Laboratory] Provisioning Laboratory: '{Name}' (ID: {ResourceId}) for Tenant {TenantId}",
            message.Name, message.ResourceId, message.TenantId);

        // Seed or update LabSettings with cryptographically rooted license token, inside this laboratory's own data scope.
        using var scope = _labContext.BeginFacilityScope(message.TenantId, message.ResourceId);
        var existingSettings = await _settingsRepository.Query()
            .FirstOrDefaultAsync(s => s.LaboratoryId == message.ResourceId, ct);

        if (existingSettings != null)
        {
            if (!string.IsNullOrWhiteSpace(message.LicenseToken))
            {
                existingSettings.LicenseToken = message.LicenseToken;
                existingSettings.PlanTier = message.PlanTier ?? "Community";
                existingSettings.MaxStaffLimit = message.Limits?.MaxStaff ?? 5;
                existingSettings.MaxAnalyzersLimit = message.Limits?.MaxAnalyzers ?? 1;
                existingSettings.LicenseExpiresAt = message.LicenseExpiresAt;
            }
            existingSettings.LaboratoryName = message.Name;
        }
        else
        {
            await _settingsRepository.AddAsync(new LabSettings
            {
                Id = Guid.NewGuid(),
                TenantId = message.TenantId,
                LaboratoryId = message.ResourceId,
                LaboratoryName = message.Name,
                LicenseToken = message.LicenseToken,
                PlanTier = message.PlanTier ?? "Community",
                MaxStaffLimit = message.Limits?.MaxStaff ?? 5,
                MaxAnalyzersLimit = message.Limits?.MaxAnalyzers ?? 1,
                LicenseExpiresAt = message.LicenseExpiresAt,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "SystemProvisioning"
            }, ct);
        }

        // Provisioning acknowledgement, queued before the save so it exists if and only if the profile was committed.
        _publisher.Enqueue(
            InteropTypes.FacilityProvisioned,
            LabInteropParties.Laboratory(message.TenantId, message.ResourceId.ToString()),
            Party.Portal,
            context.CorrelationId,
            new FacilityProvisionedEvent
            {
                ResourceId = message.ResourceId,
                TenantId = message.TenantId,
                Success = true,
                Message = $"Laboratory dashboard successfully provisioned '{message.Name}'."
            });

        await _unitOfWork.SaveChangesAsync(ct);
    }

    private static bool IsAddressedTo(Party to, FacilityCreatedEvent message) =>
        to.Kind == PartyKind.Facility
        && string.Equals(to.TenantId, message.TenantId, StringComparison.Ordinal)
        && Guid.TryParse(to.FacilityId, out var facilityId)
        && facilityId == message.ResourceId;
}
