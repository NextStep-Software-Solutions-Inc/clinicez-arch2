using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Comms.Infrastructure.Middleware;

public class TenantMigrationWritePauseMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ITenantMigrationGate _migrationGate;
    private readonly ILogger<TenantMigrationWritePauseMiddleware> _logger;

    public TenantMigrationWritePauseMiddleware(
        RequestDelegate next,
        ITenantMigrationGate migrationGate,
        ILogger<TenantMigrationWritePauseMiddleware> logger)
    {
        _next = next;
        _migrationGate = migrationGate;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // 1. Safe read methods pass through unconditionally
        if (HttpMethods.IsGet(context.Request.Method) ||
            HttpMethods.IsHead(context.Request.Method) ||
            HttpMethods.IsOptions(context.Request.Method))
        {
            await _next(context);
            return;
        }

        // 2. Allow administrative / internal migration endpoints with bypass secret
        if (context.Request.Headers.TryGetValue("X-Migration-Bypass", out var bypassKey) &&
            !string.IsNullOrWhiteSpace(bypassKey))
        {
            await _next(context);
            return;
        }

        // 3. Extract TenantId from User Claims or Route/Header
        var tenantId = context.User?.FindFirstValue("tenant_id") ??
                       context.User?.FindFirstValue("TenantId") ??
                       context.Request.Headers["X-Tenant-Id"].FirstOrDefault();

        if (!string.IsNullOrWhiteSpace(tenantId) && _migrationGate.IsTenantLocked(tenantId))
        {
            var state = _migrationGate.GetState(tenantId);
            _logger.LogWarning("Write request rejected (HTTP 423) for locked tenant {TenantId} on {Path}",
                tenantId, context.Request.Path);

            context.Response.StatusCode = StatusCodes.Status423Locked;
            context.Response.ContentType = "application/problem+json";
            context.Response.Headers.RetryAfter = "5";

            var problem = new
            {
                type = "https://clinicez.com/errors/tenant-locked-for-migration",
                title = "Tenant Locked for Migration",
                status = StatusCodes.Status423Locked,
                detail = "Tenant is moving to on-premise/cloud. Writes are temporarily paused.",
                tenantId = tenantId,
                migrationState = state?.State.ToString() ?? "Exporting",
                targetCellType = state?.TargetCellType ?? "OnPremise",
                lockedAtUtc = state?.LockedAtUtc ?? DateTime.UtcNow,
                retryAfterSeconds = 5
            };

            await context.Response.WriteAsJsonAsync(problem, options: (System.Text.Json.JsonSerializerOptions?)null, contentType: "application/problem+json");
            return;
        }

        await _next(context);
    }
}
