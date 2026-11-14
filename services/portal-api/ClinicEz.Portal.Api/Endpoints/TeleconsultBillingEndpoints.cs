using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Constants;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Api.Endpoints;

public record TeleconsultBillingDto(
    Guid TenantId,
    string TenantSlug,
    bool IsEnabled,
    string BillingMode,
    decimal RatePerMinutePhp,
    decimal AllocatedBudgetPhp,
    decimal PrepaidBalancePhp,
    bool AllowOverageBeyondAllocation,
    string CurrentPeriodYearMonth,
    int CurrentPeriodMinutesUsed,
    decimal CurrentPeriodBilledPhp,
    decimal CurrentPeriodOveragePhp,
    int EstimatedAvailableMinutes);

public record UpdateTeleconsultBillingRequest(
    bool IsEnabled,
    string BillingMode,
    decimal AllocatedBudgetPhp,
    decimal? PrepaidTopUpPhp,
    bool? AllowOverageBeyondAllocation);

public record AdminUpdateTeleconsultBillingRequest(
    bool? IsEnabled,
    string? BillingMode,
    decimal? RatePerMinutePhp,
    decimal? AllocatedBudgetPhp,
    decimal? PrepaidCreditGrantPhp,
    bool? AllowOverageBeyondAllocation);

public sealed class TeleconsultBillingEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        // -------------------------------------------------------------
        // 1. Workspace Tenant Endpoints: /tenants/{tenantSlug}/teleconsult-billing
        // -------------------------------------------------------------
        var tenantGroup = app.MapGroup("/tenants/{tenantSlug}/teleconsult-billing")
            .RequireAuthorization()
            .WithTags("Workspace Teleconsult Billing");

        tenantGroup.MapGet("", async (
            string tenantSlug,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            IApplicationDbContext dbContext,
            CancellationToken ct) =>
        {
            var auth = await AuthorizeTenant(access, httpContext, tenantSlug, WorkspaceRole.Staff, ct);
            if (auth.Result != null) return auth.Result;

            var tenant = auth.Access!.Tenant;
            var billing = await GetOrCreateBillingAsync(dbContext, tenant.Id, ct);

            return Results.Ok(ToDto(billing, tenant.TenantSlug));
        })
        .WithName("GetWorkspaceTeleconsultBilling")
        .WithDescription("Retrieves the workspace's pay-as-you-go teleconsultation billing and usage state.");

        tenantGroup.MapPut("", async (
            string tenantSlug,
            UpdateTeleconsultBillingRequest request,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            IApplicationDbContext dbContext,
            IEntitlementsPublisher entitlementsPublisher,
            CancellationToken ct) =>
        {
            var auth = await AuthorizeTenant(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (auth.Result != null) return auth.Result;

            var tenant = auth.Access!.Tenant;
            var billing = await GetOrCreateBillingAsync(dbContext, tenant.Id, ct);

            // Validation
            var mode = request.BillingMode?.Trim();
            if (!string.Equals(mode, WorkspaceTeleconsultBilling.ModePrepaid, StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(mode, WorkspaceTeleconsultBilling.ModePostpaid, StringComparison.OrdinalIgnoreCase))
            {
                return Results.BadRequest(new { Message = "BillingMode must be either 'Prepaid' or 'Postpaid'." });
            }

            if (request.AllocatedBudgetPhp < 0m)
            {
                return Results.BadRequest(new { Message = "AllocatedBudgetPhp cannot be negative." });
            }

            billing.IsEnabled = request.IsEnabled;
            billing.BillingMode = string.Equals(mode, WorkspaceTeleconsultBilling.ModePrepaid, StringComparison.OrdinalIgnoreCase)
                ? WorkspaceTeleconsultBilling.ModePrepaid
                : WorkspaceTeleconsultBilling.ModePostpaid;
            billing.AllocatedBudgetPhp = request.AllocatedBudgetPhp;

            if (request.AllowOverageBeyondAllocation.HasValue)
            {
                billing.AllowOverageBeyondAllocation = request.AllowOverageBeyondAllocation.Value;
            }

            if (request.PrepaidTopUpPhp.HasValue && request.PrepaidTopUpPhp.Value > 0m)
            {
                billing.PrepaidBalancePhp += request.PrepaidTopUpPhp.Value;
            }

            await dbContext.SaveChangesAsync(ct);

            // Re-stage licenses and trigger MediaBroker sync
            await entitlementsPublisher.StageForWorkspaceAsync(tenant.Id, ct);
            await dbContext.SaveChangesAsync(ct);

            return Results.Ok(ToDto(billing, tenant.TenantSlug));
        })
        .WithName("UpdateWorkspaceTeleconsultBilling")
        .WithDescription("Updates workspace teleconsultation activation, billing mode, cost allocation, and credit balance.");

        // -------------------------------------------------------------
        // 2. Admin SuperAdmin Endpoints: /admin/tenants/{tenantId}/teleconsult-billing
        // -------------------------------------------------------------
        var adminGroup = app.MapGroup("/admin/tenants/{tenantId}/teleconsult-billing")
            .RequireAuthorization()
            .WithTags("Admin Teleconsult Billing");

        adminGroup.MapGet("", async (
            string tenantId,
            HttpContext httpContext,
            ISender sender,
            IApplicationDbContext dbContext,
            CancellationToken ct) =>
        {
            var admin = await CheckAdminPermissionAsync(httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: StatusCodes.Status403Forbidden);

            var tenant = await ResolveTenantAsync(dbContext, tenantId, ct);
            if (tenant == null) return Results.NotFound(new { Message = "Tenant not found." });

            var billing = await GetOrCreateBillingAsync(dbContext, tenant.Id, ct);
            return Results.Ok(ToDto(billing, tenant.TenantSlug));
        })
        .WithName("GetAdminTenantTeleconsultBilling")
        .WithDescription("Gets a tenant workspace's teleconsultation billing profile for SuperAdmins.");

        adminGroup.MapPut("", async (
            string tenantId,
            AdminUpdateTeleconsultBillingRequest request,
            HttpContext httpContext,
            ISender sender,
            IApplicationDbContext dbContext,
            IEntitlementsPublisher entitlementsPublisher,
            CancellationToken ct) =>
        {
            var admin = await CheckAdminPermissionAsync(httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: StatusCodes.Status403Forbidden);

            var tenant = await ResolveTenantAsync(dbContext, tenantId, ct);
            if (tenant == null) return Results.NotFound(new { Message = "Tenant not found." });

            var billing = await GetOrCreateBillingAsync(dbContext, tenant.Id, ct);

            if (request.IsEnabled.HasValue) billing.IsEnabled = request.IsEnabled.Value;
            if (!string.IsNullOrWhiteSpace(request.BillingMode))
            {
                var mode = request.BillingMode.Trim();
                if (string.Equals(mode, WorkspaceTeleconsultBilling.ModePrepaid, StringComparison.OrdinalIgnoreCase))
                    billing.BillingMode = WorkspaceTeleconsultBilling.ModePrepaid;
                else if (string.Equals(mode, WorkspaceTeleconsultBilling.ModePostpaid, StringComparison.OrdinalIgnoreCase))
                    billing.BillingMode = WorkspaceTeleconsultBilling.ModePostpaid;
            }

            if (request.RatePerMinutePhp.HasValue && request.RatePerMinutePhp.Value > 0m)
            {
                billing.RatePerMinutePhp = request.RatePerMinutePhp.Value;
            }

            if (request.AllocatedBudgetPhp.HasValue && request.AllocatedBudgetPhp.Value >= 0m)
            {
                billing.AllocatedBudgetPhp = request.AllocatedBudgetPhp.Value;
            }

            if (request.PrepaidCreditGrantPhp.HasValue && request.PrepaidCreditGrantPhp.Value > 0m)
            {
                billing.PrepaidBalancePhp += request.PrepaidCreditGrantPhp.Value;
            }

            if (request.AllowOverageBeyondAllocation.HasValue)
            {
                billing.AllowOverageBeyondAllocation = request.AllowOverageBeyondAllocation.Value;
            }

            await dbContext.SaveChangesAsync(ct);

            // Re-stage workspace licenses and MediaBroker sync
            await entitlementsPublisher.StageForWorkspaceAsync(tenant.Id, ct);
            await dbContext.SaveChangesAsync(ct);

            return Results.Ok(ToDto(billing, tenant.TenantSlug));
        })
        .WithName("UpdateAdminTenantTeleconsultBilling")
        .WithDescription("Allows SuperAdmins to configure custom per-minute rates, grant prepaid credits, and toggle teleconsultation.");
    }

    private static async Task<WorkspaceTeleconsultBilling> GetOrCreateBillingAsync(
        IApplicationDbContext dbContext, Guid tenantId, CancellationToken ct)
    {
        var existing = await dbContext.WorkspaceTeleconsultBillings
            .FirstOrDefaultAsync(b => b.TenantId == tenantId, ct);

        if (existing != null) return existing;

        var created = new WorkspaceTeleconsultBilling
        {
            TenantId = tenantId,
            IsEnabled = false,
            BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
            RatePerMinutePhp = WorkspaceTeleconsultBilling.DefaultRatePerMinutePhp,
            AllocatedBudgetPhp = 0m,
            PrepaidBalancePhp = 0m,
            AllowOverageBeyondAllocation = true,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };

        dbContext.WorkspaceTeleconsultBillings.Add(created);
        await dbContext.SaveChangesAsync(ct);
        return created;
    }

    private static TeleconsultBillingDto ToDto(WorkspaceTeleconsultBilling billing, string tenantSlug) =>
        new(
            billing.TenantId,
            tenantSlug,
            billing.IsEnabled,
            billing.BillingMode,
            billing.RatePerMinutePhp,
            billing.AllocatedBudgetPhp,
            billing.PrepaidBalancePhp,
            billing.AllowOverageBeyondAllocation,
            billing.CurrentPeriodYearMonth,
            billing.CurrentPeriodMinutesUsed,
            billing.CurrentPeriodBilledPhp,
            billing.CurrentPeriodOveragePhp,
            billing.ComputeAvailableMinutes());

    private static async Task<Tenant?> ResolveTenantAsync(IApplicationDbContext dbContext, string tenantIdOrSlug, CancellationToken ct)
    {
        if (Guid.TryParse(tenantIdOrSlug, out var tenantGuid))
        {
            var byId = await dbContext.Tenants.FirstOrDefaultAsync(t => t.Id == tenantGuid, ct);
            if (byId != null) return byId;
        }

        var slugLower = tenantIdOrSlug.Trim().ToLowerInvariant();
        return await dbContext.Tenants.FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == slugLower, ct);
    }

    private readonly record struct AuthResult(IResult? Result, WorkspaceAccess? Access);

    private static async Task<AuthResult> AuthorizeTenant(
        IWorkspaceAccessService access, HttpContext httpContext, string tenantSlug, WorkspaceRole role, CancellationToken ct)
    {
        var userId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId)) return new AuthResult(Results.Unauthorized(), null);

        var resolved = await access.ResolveAsync(tenantSlug, userId, ct);
        if (resolved == null) return new AuthResult(Results.NotFound(new { Message = "Workspace not found." }), null);
        if (!resolved.HasAtLeast(role)) return new AuthResult(Results.Forbid(), null);

        if (resolved.Tenant.ArchivedAt != null && !HttpMethods.IsGet(httpContext.Request.Method))
        {
            return new AuthResult(Results.Conflict(new { Message = "This workspace is archived and can no longer be changed." }), null);
        }

        return new AuthResult(null, resolved);
    }

    private static async Task<AdminMeResponse?> CheckAdminPermissionAsync(HttpContext httpContext, ISender sender)
    {
        var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var email = httpContext.User.FindFirst("emails")?.Value 
                    ?? httpContext.User.FindFirst(ClaimTypes.Email)?.Value 
                    ?? httpContext.User.FindFirst("email")?.Value;

        if (string.IsNullOrEmpty(clerkUserId)) return null;

        var admin = await sender.Send(new GetAdminMeQuery(clerkUserId, email));
        if (admin == null || (!admin.Permissions.Contains(Permissions.ManageTenants) && !admin.Permissions.Contains(Permissions.ManageSettings)))
        {
            return null;
        }

        return admin;
    }
}
