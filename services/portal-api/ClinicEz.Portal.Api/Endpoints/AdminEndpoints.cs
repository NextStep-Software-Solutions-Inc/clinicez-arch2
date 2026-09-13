using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.Queries;
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

        // 5b. POST /admin/tenants/{id}/usage
        group.MapPost("/tenants/{id}/usage", async (Guid id, UpdateTenantUsageRequest request, HttpContext httpContext, ISender sender) =>
        {
            var admin = await CheckPermissionAsync(Permissions.ToggleSubscription, httpContext, sender);
            if (admin == null) return Results.Json(new { Message = "Access denied." }, statusCode: 403);

            var result = await sender.Send(new UpdateTenantUsageCommand(
                id, 
                request.ClinicalBranchesCount, 
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

        // 7. ROLES CRUD
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
    int ClinicalBranchesCount, 
    int StaffAccountsCount, 
    int ActivePatientRecordsCount, 
    int MonthlyApiQuotaUsed, 
    int MonthlyApiQuotaLimit
);
