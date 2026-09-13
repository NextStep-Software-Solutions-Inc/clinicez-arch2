using System;
using System.Threading.Tasks;
using CLINICEZ.Shared.Common;
using MassTransit;

namespace OrganizationDashboardBE.Infrastructure.Consumers;

public class FacilityCreatedConsumer : IConsumer<FacilityCreatedEvent>
{
    public async Task Consume(ConsumeContext<FacilityCreatedEvent> context)
    {
        var message = context.Message;
        
        if (message.FacilityType != FacilityType.Organization) 
            return;

        Console.WriteLine($"[OrganizationDashboardBE] Successfully Provisioned Organization: '{message.Name}' (ID: {message.ResourceId}) for Tenant {message.TenantId}");

        // Publish feedback confirmation event
        await context.Publish(new FacilityProvisionedEvent
        {
            ResourceId = message.ResourceId,
            TenantId = message.TenantId,
            Success = true,
            Message = $"Organization dashboard successfully provisioned '{message.Name}'."
        });
    }
}
