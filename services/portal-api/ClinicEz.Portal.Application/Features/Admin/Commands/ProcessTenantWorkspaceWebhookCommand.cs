using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record TenantWorkspaceWebhookPayload(
    string TenantId,
    string EventType,
    Guid ResourceId,
    string Name
);

public record ProcessTenantWorkspaceWebhookCommand(TenantWorkspaceWebhookPayload Payload) : IRequest<bool>;

public class ProcessTenantWorkspaceWebhookCommandHandler(IApplicationDbContext context) : IRequestHandler<ProcessTenantWorkspaceWebhookCommand, bool>
{
    public async Task<bool> Handle(ProcessTenantWorkspaceWebhookCommand request, CancellationToken cancellationToken)
    {
        var payload = request.Payload;
        if (string.IsNullOrEmpty(payload.TenantId) || string.IsNullOrEmpty(payload.EventType)) return false;

        var tenant = await context.Tenants.FirstOrDefaultAsync(t => 
            t.Id.ToString() == payload.TenantId || t.TenantSlug == payload.TenantId, 
            cancellationToken);

        if (tenant == null) return false;

        // Parse event type prefix (e.g. "clinic" from "clinic.created") and map to shared enum
        var parts = payload.EventType.Split('.');
        if (parts.Length == 0) return false;

        var typeString = parts[0];
        if (!Enum.TryParse<FacilityType>(typeString, true, out var facilityType))
        {
            Console.WriteLine($"[Webhook] Failed to parse facility type from event: {payload.EventType}");
            return false;
        }

        switch (facilityType)
        {
            case FacilityType.Clinic:
            case FacilityType.Laboratory:
            case FacilityType.Pharmacy:
            case FacilityType.Organization:
                tenant.ClinicalBranchesCount += 1;
                break;
        }

        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
