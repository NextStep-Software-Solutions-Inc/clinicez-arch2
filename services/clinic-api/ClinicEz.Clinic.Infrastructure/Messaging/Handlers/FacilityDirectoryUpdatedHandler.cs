using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Handles <c>facility.directory.updated</c> control-plane messages from Portal.
/// Updates the clinic's Tier-1 workspace discovery eligibility (<c>IsWorkspaceEligible</c>)
/// and synchronizes clinic name and routing slugs.
/// </summary>
public sealed class FacilityDirectoryUpdatedHandler : IInteropHandler<FacilityCreatedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<FacilityDirectoryUpdatedHandler> _logger;

    public FacilityDirectoryUpdatedHandler(
        ApplicationDbContext dbContext,
        ILogger<FacilityDirectoryUpdatedHandler> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task HandleAsync(FacilityCreatedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        // 1. Sender Authentication: Only Portal control-plane may update workspace eligibility
        var isAuthorizedPortal = context.From.Kind == PartyKind.ControlPlane &&
            string.Equals(InteropServices.For(context.From), InteropServices.Portal, StringComparison.OrdinalIgnoreCase);

        if (!isAuthorizedPortal)
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] Ignoring facility.directory.updated {MessageId}: sender {Sender} is not authorized portal control plane.",
                context.MessageId, context.From.Address);
            return;
        }

        // 2. Recipient Validation: Must be addressed to this clinic facility
        var to = context.To;
        if (to.Kind != PartyKind.Facility
            || !Guid.TryParse(to.FacilityId, out var addressedFacilityId)
            || addressedFacilityId != message.ResourceId
            || !string.Equals(to.TenantId, message.TenantId, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] Ignoring facility.directory.updated {MessageId}: addressed to {To}, not to clinic {ResourceId} of tenant {TenantId}.",
                context.MessageId, to.Address, message.ResourceId, message.TenantId);
            return;
        }

        if (message.FacilityType != FacilityType.Clinic)
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] Ignoring facility.directory.updated {MessageId}: facility type {Type} is not Clinic.",
                context.MessageId, message.FacilityType);
            return;
        }

        // 3. Multi-Tenant Filter Bypass & Update
        var tenantId = message.TenantId.ToLower();
        var settings = await _dbContext.ClinicSettings
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.ClinicId == message.ResourceId && s.TenantId.ToLower() == tenantId, ct);

        if (settings == null)
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] ClinicSettings not found for clinic {ResourceId} of tenant {TenantId} on facility.directory.updated {MessageId}.",
                message.ResourceId, message.TenantId, context.MessageId);
            return;
        }

        settings.IsWorkspaceEligible = message.IsWorkspaceEligible ?? false;

        if (!string.IsNullOrWhiteSpace(message.Name))
            settings.ClinicName = message.Name;

        if (!string.IsNullOrWhiteSpace(message.Slug))
            settings.FacilitySlug = message.Slug;

        if (!string.IsNullOrWhiteSpace(message.TenantSlug))
            settings.TenantSlug = message.TenantSlug;

        settings.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[ClinicEz.Clinic] Applied facility.directory.updated {MessageId} for clinic {ResourceId} (Tenant: {TenantId}). IsWorkspaceEligible={IsWorkspaceEligible}",
            context.MessageId, message.ResourceId, message.TenantId, settings.IsWorkspaceEligible);
    }
}
