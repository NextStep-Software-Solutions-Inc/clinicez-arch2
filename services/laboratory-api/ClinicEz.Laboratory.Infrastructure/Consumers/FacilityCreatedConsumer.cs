using System;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;
using MassTransit;

namespace ClinicEz.Laboratory.Infrastructure.Consumers;

public class FacilityCreatedConsumer : IConsumer<FacilityCreatedEvent>
{
    public async Task Consume(ConsumeContext<FacilityCreatedEvent> context)
    {
        var message = context.Message;
        
        if (message.FacilityType != FacilityType.Laboratory) 
            return;

        Console.WriteLine($"[ClinicEz.Laboratory] Successfully Provisioned Laboratory: '{message.Name}' (ID: {message.ResourceId}) for Tenant {message.TenantId}");

        // Publish feedback confirmation event
        await context.Publish(new FacilityProvisionedEvent
        {
            ResourceId = message.ResourceId,
            TenantId = message.TenantId,
            Success = true,
            Message = $"Laboratory dashboard successfully provisioned '{message.Name}'."
        });
    }
}
