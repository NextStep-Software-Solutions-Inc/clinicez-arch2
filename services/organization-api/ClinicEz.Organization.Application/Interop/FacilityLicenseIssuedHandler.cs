using ClinicEz.Organization.Domain.Entities;
using ClinicEz.Organization.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Organization.Application.Interop;

/// <summary>
/// <c>facility.license.issued</c>: acknowledges provisioning of an organization workspace with
/// <c>facility.provisioned</c> to the portal. The acknowledgement is committed through the transactional outbox;
/// redelivery of the same message is absorbed by the SDK inbox, so it is acknowledged once.
/// </summary>
public sealed class FacilityLicenseIssuedHandler : IInteropHandler<FacilityCreatedEvent>
{
    private readonly IInteropPublisher _publisher;
    private readonly IRepository<OrganizationFacility> _facilities;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<FacilityLicenseIssuedHandler> _logger;

    public FacilityLicenseIssuedHandler(
        IInteropPublisher publisher,
        IRepository<OrganizationFacility> facilities,
        IUnitOfWork unitOfWork,
        ILogger<FacilityLicenseIssuedHandler> logger)
    {
        _publisher = publisher;
        _facilities = facilities;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task HandleAsync(FacilityCreatedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        if (message.FacilityType != FacilityType.Organization)
        {
            return;
        }

        if (context.From.Kind != PartyKind.ControlPlane)
        {
            _logger.LogWarning(
                "[ClinicEz.Organization] Ignoring facility.license.issued {MessageId}: sender {Sender} is not the control plane.",
                context.MessageId, context.From.Address);
            return;
        }

        if (!IsAddressedTo(context.To, message))
        {
            _logger.LogWarning(
                "[ClinicEz.Organization] Ignoring facility.license.issued {MessageId}: addressed to {Recipient}, not to organization {ResourceId} of tenant {TenantId}.",
                context.MessageId, context.To.Address, message.ResourceId, message.TenantId);
            return;
        }

        _logger.LogInformation(
            "[ClinicEz.Organization] Successfully Provisioned Organization: '{Name}' (ID: {ResourceId}) for Tenant {TenantId}",
            message.Name, message.ResourceId, message.TenantId);

        await UpsertFacilityAsync(message, ct);

        // Acknowledgement, queued before the save so it exists if and only if the save commits.
        _publisher.Enqueue(
            InteropTypes.FacilityProvisioned,
            Party.ForFacility(message.TenantId, message.ResourceId.ToString(), FacilityType.Organization),
            Party.Portal,
            context.CorrelationId,
            new FacilityProvisionedEvent
            {
                ResourceId = message.ResourceId,
                TenantId = message.TenantId,
                Success = true,
                Message = $"Organization dashboard successfully provisioned '{message.Name}'."
            });

        await _unitOfWork.SaveChangesAsync(ct);
    }

    private async Task UpsertFacilityAsync(FacilityCreatedEvent message, CancellationToken ct)
    {
        var facility = await _facilities.FindAsync(
            f => f.TenantId == message.TenantId && f.FacilityId == message.ResourceId && !f.IsDeleted, ct);

        if (facility is null)
        {
            facility = new OrganizationFacility
            {
                TenantId = message.TenantId,
                FacilityId = message.ResourceId,
                Name = message.Name,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "SystemProvisioning"
            };
            await _facilities.AddAsync(facility, ct);
        }
        else
        {
            facility.Name = message.Name;
            facility.UpdatedAt = DateTime.UtcNow;
            facility.UpdatedBy = "SystemProvisioning";
        }

        if (!string.IsNullOrWhiteSpace(message.LicenseToken))
        {
            facility.LicenseToken = message.LicenseToken;
            facility.LicenseExpiresAt = message.LicenseExpiresAt;
            if (!string.IsNullOrWhiteSpace(message.PlanTier))
            {
                facility.PlanTier = message.PlanTier;
            }
        }
    }

    private static bool IsAddressedTo(Party to, FacilityCreatedEvent message) =>
        to.Kind == PartyKind.Facility
        && string.Equals(to.TenantId, message.TenantId, StringComparison.Ordinal)
        && Guid.TryParse(to.FacilityId, out var facilityId)
        && facilityId == message.ResourceId;
}
