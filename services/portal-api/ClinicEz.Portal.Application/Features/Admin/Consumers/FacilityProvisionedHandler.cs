using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.Admin.Consumers;

/// <summary>
/// Completes provisioning when a facility's own service reports back (<c>facility.provisioned</c>). The message is
/// accepted only from the facility it is about, so one tenant can never flip another tenant's facility status.
/// </summary>
public sealed class FacilityProvisionedHandler(
    IApplicationDbContext dbContext,
    ILogger<FacilityProvisionedHandler> logger) : IInteropHandler<FacilityProvisionedEvent>
{
    public async Task HandleAsync(FacilityProvisionedEvent payload, InteropMessageContext context, CancellationToken ct)
    {
        var facility = await dbContext.Facilities.FirstOrDefaultAsync(f => f.Id == payload.ResourceId, ct);

        if (facility == null)
        {
            logger.LogWarning("Facility {FacilityId} reported as provisioned but is unknown to the portal.", payload.ResourceId);
            return;
        }

        if (!IsSentByFacility(context.From, facility))
        {
            logger.LogWarning("Ignoring facility.provisioned for {FacilityId} from {Sender}: the sender is not that facility.",
                facility.Id, context.From.Address);
            return;
        }

        // Redelivery and late failure reports must not undo an already settled facility.
        if (facility.Status is not (FacilityStatus.Provisioning or FacilityStatus.Failed))
        {
            logger.LogInformation("Facility {FacilityId} is already {Status}; provisioning report ignored.", facility.Id, facility.Status);
            return;
        }

        facility.Status = payload.Success ? FacilityStatus.Active : FacilityStatus.Failed;
        await dbContext.SaveChangesAsync(ct);

        logger.LogInformation("Facility {FacilityName} ({FacilityId}) status updated to {Status}.", facility.Name, facility.Id, facility.Status);
    }

    private static bool IsSentByFacility(Party sender, Facility facility) =>
        sender.Kind == PartyKind.Facility
        && Guid.TryParse(sender.FacilityId, out var facilityId) && facilityId == facility.Id
        && Guid.TryParse(sender.TenantId, out var tenantId) && tenantId == facility.TenantId;
}
