using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Api.Endpoints;

public record CreateBranchTransmittalPayload(
    IReadOnlyList<Guid>? ConsultationEncounterIds = null,
    string ReportTagging = "1",
    string? EffectiveYear = null);

public class YakapTransmittalEndpoints : IEndpoint
{
    private static async Task<(bool Allowed, Branch? Branch)> ValidateBranchAccessAsync(
        Guid branchId,
        string clerkUserId,
        IApplicationDbContext context)
    {
        var branch = await context.Branches
            .Include(b => b.Tenant)
            .FirstOrDefaultAsync(b => b.Id == branchId && !b.IsDeleted);

        if (branch == null) return (false, null);

        var isOwner = branch.Tenant.OwnerId == clerkUserId;
        var isStaff = !isOwner && await context.WorkspaceMembers.AnyAsync(s =>
            s.TenantId == branch.TenantId && s.UserId == clerkUserId && s.Status == MemberStatus.Active);

        if (!isOwner && !isStaff) return (false, null);

        return (true, branch);
    }

    private static async Task<(bool Allowed, string? TenantId)> ValidateUserTenantAccessAsync(
        string clerkUserId,
        IApplicationDbContext context)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => !t.IsDeleted && (t.OwnerId == clerkUserId ||
                context.WorkspaceMembers.Any(s => s.TenantId == t.Id && s.UserId == clerkUserId && s.Status == MemberStatus.Active)));

        if (tenant == null) return (false, null);
        return (true, tenant.Id.ToString());
    }

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/yakap").WithTags("PhilHealth YAKAP Transmittals").RequireAuthorization();

        // 1. Get eligible clinical encounters for a branch
        group.MapGet("/branches/{branchId:guid}/eligible-encounters", async (
            Guid branchId,
            string reportTagging,
            DateTime? startDate,
            DateTime? endDate,
            HttpContext httpContext,
            IApplicationDbContext context,
            IClinicApiClient clinicClient,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var (allowed, branch) = await ValidateBranchAccessAsync(branchId, clerkUserId, context);
            if (!allowed || branch == null) return Results.Forbid();

            var tagging = string.IsNullOrWhiteSpace(reportTagging) ? "2" : reportTagging;
            var response = await clinicClient.GetEligibleEncountersAsync(
                branch.TenantId.ToString(),
                branch.Id,
                tagging,
                startDate,
                endDate,
                ct);

            return response.Succeeded ? Results.Ok(response) : Results.BadRequest(response);
        })
        .WithName("GetBranchEligibleEncounters")
        .WithDescription("Retrieves signed clinical encounters eligible for PhilHealth YAKAP transmittal under a specific branch.");

        // 2. Get transmittal batches for a branch
        group.MapGet("/branches/{branchId:guid}/transmittals", async (
            Guid branchId,
            string? status,
            string? reportTagging,
            HttpContext httpContext,
            IApplicationDbContext context,
            IClinicApiClient clinicClient,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var (allowed, branch) = await ValidateBranchAccessAsync(branchId, clerkUserId, context);
            if (!allowed || branch == null) return Results.Forbid();

            var response = await clinicClient.GetTransmittalsAsync(
                branch.TenantId.ToString(),
                branch.Id,
                status,
                reportTagging,
                ct);

            return response.Succeeded ? Results.Ok(response) : Results.BadRequest(response);
        })
        .WithName("GetBranchTransmittals")
        .WithDescription("Retrieves PhilHealth YAKAP transmittals compiled for a specific branch.");

        // 3. Get single transmittal by ID
        group.MapGet("/transmittals/{id:guid}", async (
            Guid id,
            Guid? branchId,
            HttpContext httpContext,
            IApplicationDbContext context,
            IClinicApiClient clinicClient,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            string tenantId = string.Empty;
            if (branchId.HasValue && branchId.Value != Guid.Empty)
            {
                var (allowed, branch) = await ValidateBranchAccessAsync(branchId.Value, clerkUserId, context);
                if (!allowed || branch == null) return Results.Forbid();
                tenantId = branch.TenantId.ToString();
            }
            else
            {
                var (allowed, userTenantId) = await ValidateUserTenantAccessAsync(clerkUserId, context);
                if (!allowed || string.IsNullOrEmpty(userTenantId)) return Results.Forbid();
                tenantId = userTenantId;
            }

            var response = await clinicClient.GetTransmittalByIdAsync(tenantId, id, ct);
            return response.Succeeded ? Results.Ok(response) : Results.NotFound(response);
        })
        .WithName("GetTransmittalById")
        .WithDescription("Retrieves details of a PhilHealth YAKAP transmittal including its patient line items.");

        // 4. Get raw XML for transmittal
        group.MapGet("/transmittals/{id:guid}/xml", async (
            Guid id,
            Guid? branchId,
            HttpContext httpContext,
            IApplicationDbContext context,
            IClinicApiClient clinicClient,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            string tenantId = string.Empty;
            if (branchId.HasValue && branchId.Value != Guid.Empty)
            {
                var (allowed, branch) = await ValidateBranchAccessAsync(branchId.Value, clerkUserId, context);
                if (!allowed || branch == null) return Results.Forbid();
                tenantId = branch.TenantId.ToString();
            }
            else
            {
                var (allowed, userTenantId) = await ValidateUserTenantAccessAsync(clerkUserId, context);
                if (!allowed || string.IsNullOrEmpty(userTenantId)) return Results.Forbid();
                tenantId = userTenantId;
            }

            var response = await clinicClient.GetTransmittalRawXmlAsync(tenantId, id, ct);
            return response.Succeeded ? Results.Ok(response) : Results.NotFound(response);
        })
        .WithName("GetTransmittalXml")
        .WithDescription("Retrieves raw generated PhilHealth Konsulta PCB XML for auditing.");

        // 5. Compile new batch transmittal for a branch
        group.MapPost("/branches/{branchId:guid}/transmittals", async (
            Guid branchId,
            CreateBranchTransmittalPayload payload,
            HttpContext httpContext,
            IApplicationDbContext context,
            IClinicApiClient clinicClient,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var (allowed, branch) = await ValidateBranchAccessAsync(branchId, clerkUserId, context);
            if (!allowed || branch == null) return Results.Forbid();

            // Statutory PhilHealth check
            if (!branch.IsPhilHealthAccredited || string.IsNullOrWhiteSpace(branch.PhilHealthPmccNumber))
            {
                return Results.BadRequest(ApiResponse<object>.Fail(
                    $"Branch '{branch.Name}' is not configured for PhilHealth YAKAP transmittals. Please configure PMCC credentials under Branches & Locations."));
            }

            var request = new PortalCreateYakapTransmittalRequest(
                ConsultationEncounterIds: payload.ConsultationEncounterIds,
                ReportTagging: string.IsNullOrWhiteSpace(payload.ReportTagging) ? "1" : payload.ReportTagging,
                EffectiveYear: payload.EffectiveYear ?? DateTime.UtcNow.Year.ToString(),
                BranchId: branch.Id);

            var response = await clinicClient.CreateTransmittalAsync(
                branch.TenantId.ToString(),
                branch.Id,
                request,
                ct);

            return response.Succeeded ? Results.Ok(response) : Results.BadRequest(response);
        })
        .WithName("CreateBranchTransmittal")
        .WithDescription("Compiles eligible encounters into a PhilHealth YAKAP transmittal batch under the branch's PMCC accreditation.");

        // 6. Validate transmittal against DTD schema
        group.MapPost("/transmittals/{id:guid}/validate", async (
            Guid id,
            Guid? branchId,
            HttpContext httpContext,
            IApplicationDbContext context,
            IClinicApiClient clinicClient,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            string tenantId = string.Empty;
            if (branchId.HasValue && branchId.Value != Guid.Empty)
            {
                var (allowed, branch) = await ValidateBranchAccessAsync(branchId.Value, clerkUserId, context);
                if (!allowed || branch == null) return Results.Forbid();
                tenantId = branch.TenantId.ToString();
            }
            else
            {
                var (allowed, userTenantId) = await ValidateUserTenantAccessAsync(clerkUserId, context);
                if (!allowed || string.IsNullOrEmpty(userTenantId)) return Results.Forbid();
                tenantId = userTenantId;
            }

            var response = await clinicClient.ValidateTransmittalAsync(tenantId, id, ct);
            return response.Succeeded ? Results.Ok(response) : Results.BadRequest(response);
        })
        .WithName("ValidateTransmittal")
        .WithDescription("Pre-validates a transmittal batch XML against PhilHealth Konsulta schemas.");

        // 7. Submit transmittal batch to PhilHealth
        group.MapPost("/branches/{branchId:guid}/transmittals/{id:guid}/submit", async (
            Guid branchId,
            Guid id,
            HttpContext httpContext,
            IApplicationDbContext context,
            IClinicApiClient clinicClient,
            CancellationToken ct) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var (allowed, branch) = await ValidateBranchAccessAsync(branchId, clerkUserId, context);
            if (!allowed || branch == null) return Results.Forbid();

            if (!branch.IsPhilHealthAccredited || string.IsNullOrWhiteSpace(branch.PhilHealthPmccNumber))
            {
                return Results.BadRequest(ApiResponse<object>.Fail(
                    $"Branch '{branch.Name}' does not have PhilHealth accreditation or PMCC number configured."));
            }

            var response = await clinicClient.SubmitTransmittalAsync(
                branch.TenantId.ToString(),
                branch.Id,
                id,
                ct);

            return response.Succeeded ? Results.Ok(response) : Results.BadRequest(response);
        })
        .WithName("SubmitBranchTransmittal")
        .WithDescription("Signs, encrypts, and transmits a PhilHealth YAKAP transmittal batch via the PhilHealth Proxy.");
    }
}
