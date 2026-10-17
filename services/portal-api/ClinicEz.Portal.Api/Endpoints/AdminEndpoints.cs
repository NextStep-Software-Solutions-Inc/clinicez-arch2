using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.Commands.RecordManualPayment;
using ClinicEz.Portal.Application.Features.Admin.Commands.UpdateTenantOverrides;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Admin.Queries.GetTenantOverrides;
using ClinicEz.Portal.Application.Features.Billing.Commands;
using ClinicEz.Portal.Application.Features.Billing.Queries;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Domain.Constants;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Portal.Api.Endpoints;

public class AdminEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/admin").WithTags("Admin").RequireAuthorization();

        // 1. GET /admin/me
        group.MapGet("/me", async (HttpContext httpContext, ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var email = httpContext.User.FindFirst("emails")?.Value 
                        ?? httpContext.User.FindFirst(ClaimTypes.Email)?.Value 
                        ?? httpContext.User.FindFirst("email")?.Value;

            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var result = await sender.Send(new GetAdminMeQuery(clerkUserId, email));
            if (result == null)
            {
                return Results.Json(new { Message = "Access denied. Not an administrative profile." }, statusCode: 403);
            }

            return Results.Ok(result);
        })
        .WithName("GetAdminMe")
        .WithDescription("Gets the current user's administrative profile and permission scopes.")
        .WithTags("Admin");

        // 2. GET /admin/analytics
        group.MapGet("/analytics", async (HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ViewAnalytics, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new GetAdminAnalyticsQuery());
            return Results.Ok(result);
        })
        .WithName("GetAdminAnalytics")
        .WithDescription("Retrieves portal registration analytics and recurring revenue calculations.")
        .WithTags("Admin");

        // 3. GET /admin/tenants
        group.MapGet("/tenants", async (HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ViewTenants, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new GetAdminTenantsQuery());
            return Results.Ok(result);
        })
        .WithName("GetAdminTenants")
        .WithDescription("Lists all registered tenants with their subscription statuses.")
        .WithTags("Admin");

        // 4. GET /admin/leads
        group.MapGet("/leads", async (HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ViewTenants, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new GetAdminLeadsQuery());
            return Results.Ok(result);
        })
        .WithName("GetAdminLeads")
        .WithDescription("Retrieves unsubscribed lead users who completed initial registration.")
        .WithTags("Admin");

        // 5. POST /admin/tenants/{id}/toggle-subscription
        group.MapPost("/tenants/{id}/toggle-subscription", async (Guid id, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ToggleSubscription, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new ToggleTenantSubscriptionCommand(id));
            return result != null ? Results.Ok(result) : Results.NotFound("Tenant not found");
        })
        .WithName("ToggleTenantSubscription")
        .WithDescription("Toggles tenant subscription state between ACTIVE and TRIALING (SuperAdmin scope).")
        .WithTags("Admin");

        // 5c. POST /admin/tenants/{id}/record-payment
        group.MapPost("/tenants/{id}/record-payment", async (
            Guid id, 
            RecordManualPaymentRequest request, 
            HttpContext httpContext, 
            ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ToggleSubscription, httpContext, sender)
                        ?? await CheckPermissionAsync(Permissions.ManageTenants, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var command = new RecordManualPaymentCommand(
                id,
                request.PlanSlug,
                request.IsAnnual,
                request.PaymentMethod,
                request.TransactionReference,
                request.Amount,
                request.Notes,
                request.PaymentDate,
                admin.FullName
            );

            var result = await sender.Send(command);
            return result != null ? Results.Ok(result) : Results.NotFound("Tenant or Plan not found");
        })
        .WithName("RecordManualPayment")
        .WithDescription("Records a manual offline payment, generates invoice and receipt, and activates workspace subscription and licenses (SuperAdmin scope).")
        .WithTags("Admin");

        // 5b. POST /admin/tenants/{id}/usage
        group.MapPost("/tenants/{id}/usage", async (Guid id, UpdateTenantUsageRequest request, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ToggleSubscription, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new UpdateTenantUsageCommand(
                id, 
                request.FacilitiesCount, 
                request.StaffAccountsCount, 
                request.ActivePatientRecordsCount, 
                request.MonthlyApiQuotaUsed, 
                request.MonthlyApiQuotaLimit
            ));
            return result != null ? Results.Ok(result) : Results.NotFound("Tenant not found");
        })
        .WithName("UpdateTenantUsage")
        .WithDescription("Updates tenant workspace usage metrics and limits (SuperAdmin scope).")
        .WithTags("Admin");

        // 5c. POST /admin/hub/resync
        group.MapPost("/hub/resync", async (HttpContext httpContext, ISender sender, IHubDirectoryResyncService resync, CancellationToken ct) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageTenants, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await resync.ResyncAsync(ct);
            return Results.Ok(result);
        })
        .WithName("ResyncHubDirectory")
        .WithDescription("Re-enqueues every cell, facility and link to the hub directory. Idempotent (every message is an upsert); use after the hub directory was reset or restored.")
        .WithTags("Admin");

        // 6. BLOG CRUD
        group.MapGet("/blogs", async (HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageBlogs, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new GetBlogArticlesQuery());
            return Results.Ok(result);
        })
        .WithName("GetAdminBlogs")
        .WithTags("Admin");

        group.MapGet("/blogs/{id}", async (Guid id, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageBlogs, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new GetBlogArticleByIdQuery(id));
            return result != null ? Results.Ok(result) : Results.NotFound("Blog not found");
        })
        .WithName("GetAdminBlogById")
        .WithTags("Admin");

        group.MapPost("/blogs", async (BlogArticle input, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageBlogs, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            try
            {
                var result = await sender.Send(new CreateBlogArticleCommand(
                    input.Title,
                    input.Slug,
                    input.Content,
                    input.Summary,
                    input.Author,
                    input.Category,
                    input.Status,
                    admin.FullName,
                    input.BannerUrl
                ));
                return result != null ? Results.Created($"/admin/blogs/{result.Id}", result) : Results.BadRequest();
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        })
        .WithName("CreateAdminBlog")
        .WithTags("Admin");

        group.MapPut("/blogs/{id}", async (Guid id, BlogArticle input, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageBlogs, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            try
            {
                var result = await sender.Send(new UpdateBlogArticleCommand(
                    id,
                    input.Title,
                    input.Slug,
                    input.Content,
                    input.Summary,
                    input.Author,
                    input.Category,
                    input.Status,
                    admin.FullName,
                    input.BannerUrl
                ));
                return result != null ? Results.Ok(result) : Results.NotFound("Blog not found");
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        })
        .WithName("UpdateAdminBlog")
        .WithTags("Admin");

        group.MapDelete("/blogs/{id}", async (Guid id, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageBlogs, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var success = await sender.Send(new DeleteBlogArticleCommand(id));
            return success ? Results.Ok(true) : Results.NotFound("Blog not found");
        })
        .WithName("DeleteAdminBlog")
        .WithTags("Admin");

        // 7. ROLES CRUD & PERMISSIONS
        group.MapGet("/permissions", async (HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageRoles, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            return Results.Ok(Permissions.Definitions);
        })
        .WithName("GetAdminPermissions")
        .WithDescription("Retrieves all available system permission descriptors.")
        .WithTags("Admin");

        group.MapGet("/roles", async (HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageRoles, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new GetAdminRolesQuery());
            return Results.Ok(result);
        })
        .WithName("GetAdminRoles")
        .WithTags("Admin");

        group.MapPost("/roles", async (AdminRole input, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageRoles, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            try
            {
                var result = await sender.Send(new CreateAdminRoleCommand(
                    input.Name,
                    input.Description,
                    input.Permissions,
                    admin.FullName
                ));
                return result != null ? Results.Created($"/admin/roles/{result.Id}", result) : Results.BadRequest();
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        })
        .WithName("CreateAdminRole")
        .WithTags("Admin");

        group.MapPut("/roles/{id:guid}", async (Guid id, AdminRole input, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageRoles, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            try
            {
                var result = await sender.Send(new UpdateAdminRoleCommand(
                    id,
                    input.Name,
                    input.Description,
                    input.Permissions,
                    admin.FullName
                ));
                return result != null ? Results.Ok(result) : Results.NotFound("Role not found");
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        })
        .WithName("UpdateAdminRole")
        .WithTags("Admin");

        group.MapDelete("/roles/{id:guid}", async (Guid id, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageRoles, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            try
            {
                var success = await sender.Send(new DeleteAdminRoleCommand(id, admin.FullName));
                return success ? Results.Ok(true) : Results.NotFound("Role not found");
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        })
        .WithName("DeleteAdminRole")
        .WithTags("Admin");

        // 8. ADMIN USERS CRUD
        group.MapGet("/users", async (HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageAdmins, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new GetAdminUsersQuery());
            return Results.Ok(result);
        })
        .WithName("GetAdminUsers")
        .WithTags("Admin");

        group.MapPost("/users", async (AdminUser input, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageAdmins, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            try
            {
                var result = await sender.Send(new CreateAdminUserCommand(
                    input.Email,
                    input.FullName,
                    input.RoleId,
                    admin.FullName
                ));
                return result != null ? Results.Created($"/admin/users/{result.Id}", result) : Results.BadRequest();
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        })
        .WithName("CreateAdminUser")
        .WithTags("Admin");

        group.MapPut("/users/{id}", async (Guid id, AdminUser input, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageAdmins, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            try
            {
                var result = await sender.Send(new UpdateAdminUserCommand(
                    id,
                    input.Email,
                    input.FullName,
                    input.RoleId,
                    input.IsActive,
                    admin.FullName
                ));
                return result != null ? Results.Ok(result) : Results.NotFound("Admin user not found");
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        })
        .WithName("UpdateAdminUser")
        .WithTags("Admin");

        group.MapDelete("/users/{id}", async (Guid id, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageAdmins, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";

            try
            {
                var success = await sender.Send(new DeleteAdminUserCommand(id, clerkUserId));
                return success ? Results.Ok(true) : Results.NotFound("Admin user not found");
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        })
        .WithName("DeleteAdminUser")
        .WithTags("Admin");

        // 9. SYSTEM SETTINGS CRUD
        group.MapGet("/settings", async (HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageSettings, httpContext, sender)
                        ?? await CheckPermissionAsync(Permissions.ManageTenants, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new GetAdminSystemSettingsQuery());
            return Results.Ok(result);
        })
        .WithName("GetAdminSettings")
        .WithDescription("Retrieves platform-wide system settings categorized for admin configuration.")
        .WithTags("Admin");

        group.MapPut("/settings", async (Dictionary<string, string> input, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageSettings, httpContext, sender)
                        ?? await CheckPermissionAsync(Permissions.ManageTenants, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            try
            {
                var result = await sender.Send(new UpdateAdminSystemSettingsCommand(input, admin.FullName));
                return Results.Ok(result);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
        })
        .WithName("UpdateAdminSettings")
        .WithDescription("Updates platform-wide system settings and invalidates cache.")
        .WithTags("Admin");

        // 20. Plan Management Endpoints (SuperAdmin scope)
        group.MapGet("/plans", async (HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManagePlans, httpContext, sender)
                        ?? await CheckPermissionAsync(Permissions.ViewTenants, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new GetBillingPlansQuery());
            return Results.Ok(result);
        })
        .WithName("AdminGetBillingPlans")
        .WithDescription("Retrieves all commercial billing plans with admin metrics.")
        .WithTags("Admin");

        group.MapPost("/plans", async (CreateBillingPlanCommand command, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManagePlans, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(command);
            return Results.Created($"/admin/plans/{result}", new { Id = result });
        })
        .WithName("AdminCreateBillingPlan")
        .WithDescription("Creates a new commercial billing plan (SuperAdmin scope).")
        .WithTags("Admin");

        group.MapPut("/plans/{id:guid}", async (Guid id, UpdateBillingPlanCommand command, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManagePlans, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            if (id != command.Id) return Results.BadRequest("Id mismatch");
            var success = await sender.Send(command);
            return success ? Results.Ok(new { Success = true }) : Results.NotFound();
        })
        .WithName("AdminUpdateBillingPlan")
        .WithDescription("Updates an existing billing plan, bumps plan version, and cascades license re-issuance (SuperAdmin scope).")
        .WithTags("Admin");

        group.MapDelete("/plans/{id:guid}", async (Guid id, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManagePlans, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var success = await sender.Send(new DeleteBillingPlanCommand { Id = id });
            return success ? Results.Ok(new { Success = true }) : Results.NotFound();
        })
        .WithName("AdminDeleteBillingPlan")
        .WithDescription("Deletes an unused billing plan by ID (SuperAdmin scope).")
        .WithTags("Admin");

        // 21. Tenant Entitlement Overrides Endpoints (SuperAdmin scope)
        group.MapGet("/tenants/{id:guid}/overrides", async (Guid id, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageTenants, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new GetTenantOverridesQuery(id));
            return result != null ? Results.Ok(result) : Results.NotFound("Tenant not found");
        })
        .WithName("GetTenantOverrides")
        .WithDescription("Retrieves custom per-workspace entitlement overrides and effective limits/features.")
        .WithTags("Admin");

        group.MapPut("/tenants/{id:guid}/overrides", async (
            Guid id,
            UpdateTenantOverridesRequest request,
            HttpContext httpContext,
            ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ManageTenants, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var command = new UpdateTenantOverridesCommand(
                id,
                request.Limits,
                request.Features,
                request.Reason,
                admin.FullName
            );

            var result = await sender.Send(command);
            return result != null ? Results.Ok(result) : Results.NotFound("Tenant not found");
        })
        .WithName("UpdateTenantOverrides")
        .WithDescription("Updates custom per-workspace entitlement overrides, increments entitlement version, and re-stages facility licenses (SuperAdmin scope).")
        .WithTags("Admin");
    }

    private static async Task<AdminMeResponse?> CheckPermissionAsync(
        string requiredPermission,
        HttpContext httpContext,
        ISender sender)
    {
        var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var email = httpContext.User.FindFirst("emails")?.Value 
                    ?? httpContext.User.FindFirst(ClaimTypes.Email)?.Value 
                    ?? httpContext.User.FindFirst("email")?.Value;

        if (string.IsNullOrEmpty(clerkUserId)) return null;

        var admin = await sender.Send(new GetAdminMeQuery(clerkUserId, email));
        if (admin == null || !admin.Permissions.Contains(requiredPermission))
        {
            return null;
        }
        return admin;
    }
}

public record UpdateTenantUsageRequest(
    int FacilitiesCount, 
    int StaffAccountsCount, 
    int ActivePatientRecordsCount, 
    int MonthlyApiQuotaUsed, 
    int MonthlyApiQuotaLimit
);

public record RecordManualPaymentRequest(
    string PlanSlug,
    bool IsAnnual,
    string PaymentMethod,
    string? TransactionReference,
    decimal Amount,
    string? Notes,
    DateTime? PaymentDate = null
);

