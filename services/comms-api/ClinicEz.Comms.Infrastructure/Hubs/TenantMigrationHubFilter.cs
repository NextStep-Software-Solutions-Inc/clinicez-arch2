using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using Microsoft.AspNetCore.SignalR;

namespace ClinicEz.Comms.Infrastructure.Hubs;

public class TenantMigrationHubFilter : IHubFilter
{
    private static readonly HashSet<string> MutatingMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        nameof(CommsHub.SendMessage),
        nameof(CommsHub.SendReaction),
        nameof(CommsHub.AcknowledgeMessage),
        nameof(CommsHub.ConfirmDelivery)
    };

    private readonly ITenantMigrationGate _migrationGate;

    public TenantMigrationHubFilter(ITenantMigrationGate migrationGate)
    {
        _migrationGate = migrationGate;
    }

    public async ValueTask<object?> InvokeMethodAsync(
        HubInvocationContext invocationContext,
        Func<HubInvocationContext, ValueTask<object?>> next)
    {
        if (MutatingMethods.Contains(invocationContext.HubMethodName))
        {
            var tenantId = invocationContext.Context.User?.FindFirstValue("tenant_id") ??
                           invocationContext.Context.User?.FindFirstValue("TenantId");

            if (!string.IsNullOrWhiteSpace(tenantId) && _migrationGate.IsTenantLocked(tenantId))
            {
                throw new HubException("Tenant is moving to on-premise/cloud. Writes are temporarily paused.");
            }
        }

        return await next(invocationContext);
    }
}
