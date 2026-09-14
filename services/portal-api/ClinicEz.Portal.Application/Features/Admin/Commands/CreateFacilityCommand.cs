using ClinicEz.Portal.Domain.Entities;
using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record CreateFacilityCommand(
    string TenantId,
    FacilityType FacilityType,
    string Name
) : IRequest<bool>;

public class CreateFacilityCommandHandler(
    IApplicationDbContext context,
    IPublishEndpoint publishEndpoint
) : IRequestHandler<CreateFacilityCommand, bool>
{
    public async Task<bool> Handle(CreateFacilityCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.TenantId) || string.IsNullOrEmpty(request.Name)) return false;

        var tenant = await context.Tenants.FirstOrDefaultAsync(t => 
            t.Id.ToString() == request.TenantId || t.TenantSlug == request.TenantId, 
            cancellationToken);

        if (tenant == null) return false;

        // Provision resource ID
        var resourceId = Guid.NewGuid();

        // Create tracking record
        var facility = new Facility
        {
            Id = resourceId,
            TenantId = tenant.Id,
            Name = request.Name,
            FacilityType = request.FacilityType,
            Status = FacilityStatus.Provisioning
        };
        context.Facilities.Add(facility);

        // Increment telemetry counts
        tenant.FacilitiesCount += 1;

        // Publish the event using MassTransit (which automatically registers in the Outbox transaction)
        await publishEndpoint.Publish(new FacilityCreatedEvent
        {
            TenantId = tenant.Id.ToString(),
            FacilityType = request.FacilityType,
            ResourceId = resourceId,
            Name = request.Name
        }, cancellationToken);

        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
