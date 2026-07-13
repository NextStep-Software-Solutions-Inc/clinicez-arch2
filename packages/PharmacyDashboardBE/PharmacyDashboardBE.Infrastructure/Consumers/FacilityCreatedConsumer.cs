using System;
using System.Threading.Tasks;
using CLINICEZ.Shared.Common;
using MassTransit;

namespace PharmacyDashboardBE.Infrastructure.Consumers;

public class FacilityCreatedConsumer : IConsumer<FacilityCreatedEvent>
{
    public async Task Consume(ConsumeContext<FacilityCreatedEvent> context)
    {
        var message = context.Message;
        
        if (message.FacilityType != FacilityType.Pharmacy) 
            return;

        Console.WriteLine($"[PharmacyDashboardBE] Successfully Provisioned Pharmacy: '{message.Name}' (ID: {message.ResourceId}) for Tenant {message.TenantId}");

        // Publish feedback confirmation event
        await context.Publish(new FacilityProvisionedEvent
        {
            ResourceId = message.ResourceId,
            TenantId = message.TenantId,
            Success = true,
            Message = $"Pharmacy dashboard successfully provisioned '{message.Name}'."
        });
    }
}
