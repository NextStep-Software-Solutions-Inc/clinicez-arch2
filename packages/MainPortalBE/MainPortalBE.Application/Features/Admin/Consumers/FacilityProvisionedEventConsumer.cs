using System;
using System.Threading.Tasks;
using CLINICEZ.Shared.Common;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Domain.Entities;
using MassTransit;
using Microsoft.EntityFrameworkCore;

namespace MainPortalBE.Application.Features.Admin.Consumers;

public class FacilityProvisionedEventConsumer(
    IApplicationDbContext dbContext
) : IConsumer<FacilityProvisionedEvent>
{
    public async Task Consume(ConsumeContext<FacilityProvisionedEvent> context)
    {
        var message = context.Message;
        
        var facility = await dbContext.Facilities.FirstOrDefaultAsync(f => 
            f.Id == message.ResourceId, 
            context.CancellationToken);

        if (facility == null)
        {
            Console.WriteLine($"[MainPortalBE] Facility not found: {message.ResourceId}");
            return;
        }

        facility.Status = message.Success ? FacilityStatus.Active : FacilityStatus.Failed;
        
        Console.WriteLine($"[MainPortalBE] Facility {facility.Name} ({facility.Id}) status updated to: {facility.Status}");

        await dbContext.SaveChangesAsync(context.CancellationToken);
    }
}
