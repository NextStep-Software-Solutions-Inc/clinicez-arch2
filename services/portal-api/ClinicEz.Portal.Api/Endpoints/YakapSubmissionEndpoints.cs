using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.PhilHealth;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.PhilHealth;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Api.Endpoints;

public record TestPcapiConnectionRequest(
    string? AccreditationNumber = null,
    string? SecretKey = null,
    string? SoftwareCertificateId = null,
    string? BaseUrl = null);

public class YakapSubmissionEndpoints : IEndpoint
{
    public static async Task<(bool Allowed, Branch? Branch)> ValidateBranchAccessAsync(
        Guid branchId,
        string clerkUserId,
        IApplicationDbContext context,
        CancellationToken ct)
    {
        var branch = await context.Branches
            .Include(b => b.Tenant)
            .FirstOrDefaultAsync(b => b.Id == branchId && !b.IsDeleted, ct);

        if (branch == null) return (false, null);

        var isOwner = branch.Tenant.OwnerId == clerkUserId;
        var isStaff = !isOwner && await context.WorkspaceMembers.AnyAsync(s =>
            s.TenantId == branch.TenantId && s.UserId == clerkUserId && s.Status == MemberStatus.Active, ct);

        if (!isOwner && !isStaff) return (false, branch);

        return (true, branch);
    }

    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/yakap").WithTags("PhilHealth YAKAP 2.0 Submissions").RequireAuthorization();

        group.MapGet("/branches/{branchId:guid}/summary", GetBranchYakapSummaryAsync)
            .WithName("GetBranchYakapSummary")
            .WithDescription("Retrieves Zero-PHI YAKAP 2.0 telemetry summary and KPI indicators for a branch.");

        group.MapGet("/branches/{branchId:guid}/submissions", GetBranchSubmissionsAsync)
            .WithName("GetBranchSubmissions")
            .WithDescription("Retrieves Zero-PHI PhilHealth YAKAP 2.0 submissions for a branch.");

        group.MapGet("/branches/{branchId:guid}/submissions/{id:guid}", GetSubmissionByIdAsync)
            .WithName("GetSubmissionById")
            .WithDescription("Retrieves Zero-PHI details of an individual YAKAP 2.0 submission.");

        group.MapPost("/branches/{branchId:guid}/submissions/{id:guid}/poll", PollSubmissionStatusAsync)
            .WithName("PollSubmissionStatus")
            .WithDescription("Polls PhilHealth PCAPI for latest processing status of a pending YAKAP submission.");

        group.MapPost("/branches/{branchId:guid}/submissions/{id:guid}/retry", RetrySubmissionAsync)
            .WithName("RetrySubmission")
            .WithDescription("Retries a failed YAKAP submission.");

        group.MapPost("/branches/{branchId:guid}/masterlist/sync", SyncMasterlistAsync)
            .WithName("SyncMasterlist")
            .WithDescription("Triggers Service 05 Masterlist synchronization with PhilHealth PCAPI.");

        group.MapPost("/test-connection", TestConnectionAsync)
            .WithName("TestYakapPcapiConnection")
            .WithDescription("Tests connectivity to PhilHealth PCAPI gateway for YAKAP 2.0 submissions.");
    }

    public static async Task<IResult> GetBranchYakapSummaryAsync(
        Guid branchId,
        HttpContext httpContext,
        IApplicationDbContext context,
        IClinicApiClient clinicClient,
        CancellationToken ct)
    {
        var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

        var (allowed, branch) = await ValidateBranchAccessAsync(branchId, clerkUserId, context, ct);
        if (branch == null) return Results.NotFound(new { Message = "Branch not found." });
        if (!allowed) return Results.Forbid();

        var response = await clinicClient.GetBranchYakapSummaryAsync(
            branch.TenantId.ToString(),
            branch.Id,
            ct);

        return response.Succeeded ? Results.Ok(response) : Results.BadRequest(response);
    }

    public static async Task<IResult> GetBranchSubmissionsAsync(
        Guid branchId,
        string? status,
        string? submissionType,
        int? page,
        int? pageSize,
        HttpContext httpContext,
        IApplicationDbContext context,
        IClinicApiClient clinicClient,
        CancellationToken ct)
    {
        var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

        var (allowed, branch) = await ValidateBranchAccessAsync(branchId, clerkUserId, context, ct);
        if (branch == null) return Results.NotFound(new { Message = "Branch not found." });
        if (!allowed) return Results.Forbid();

        var response = await clinicClient.GetSubmissionsAsync(
            branch.TenantId.ToString(),
            branch.Id,
            status,
            submissionType,
            page ?? 1,
            pageSize ?? 50,
            ct);

        return response.Succeeded ? Results.Ok(response) : Results.BadRequest(response);
    }

    public static async Task<IResult> GetSubmissionByIdAsync(
        Guid branchId,
        Guid id,
        HttpContext httpContext,
        IApplicationDbContext context,
        IClinicApiClient clinicClient,
        CancellationToken ct)
    {
        var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

        var (allowed, branch) = await ValidateBranchAccessAsync(branchId, clerkUserId, context, ct);
        if (branch == null) return Results.NotFound(new { Message = "Branch not found." });
        if (!allowed) return Results.Forbid();

        var response = await clinicClient.GetSubmissionByIdAsync(
            branch.TenantId.ToString(),
            branch.Id,
            id,
            ct);

        return response.Succeeded ? Results.Ok(response) : Results.NotFound(response);
    }

    public static async Task<IResult> PollSubmissionStatusAsync(
        Guid branchId,
        Guid id,
        HttpContext httpContext,
        IApplicationDbContext context,
        IClinicApiClient clinicClient,
        CancellationToken ct)
    {
        var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

        var (allowed, branch) = await ValidateBranchAccessAsync(branchId, clerkUserId, context, ct);
        if (branch == null) return Results.NotFound(new { Message = "Branch not found." });
        if (!allowed) return Results.Forbid();

        var response = await clinicClient.PollSubmissionStatusAsync(
            branch.TenantId.ToString(),
            branch.Id,
            id,
            ct);

        return response.Succeeded ? Results.Ok(response) : Results.BadRequest(response);
    }

    public static async Task<IResult> RetrySubmissionAsync(
        Guid branchId,
        Guid id,
        HttpContext httpContext,
        IApplicationDbContext context,
        IClinicApiClient clinicClient,
        CancellationToken ct)
    {
        var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

        var (allowed, branch) = await ValidateBranchAccessAsync(branchId, clerkUserId, context, ct);
        if (branch == null) return Results.NotFound(new { Message = "Branch not found." });
        if (!allowed) return Results.Forbid();

        var response = await clinicClient.RetrySubmissionAsync(
            branch.TenantId.ToString(),
            branch.Id,
            id,
            ct);

        return response.Succeeded ? Results.Ok(response) : Results.BadRequest(response);
    }

    public static async Task<IResult> SyncMasterlistAsync(
        Guid branchId,
        HttpContext httpContext,
        IApplicationDbContext context,
        IClinicApiClient clinicClient,
        CancellationToken ct)
    {
        var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

        var (allowed, branch) = await ValidateBranchAccessAsync(branchId, clerkUserId, context, ct);
        if (branch == null) return Results.NotFound(new { Message = "Branch not found." });
        if (!allowed) return Results.Forbid();

        var response = await clinicClient.SyncMasterlistAsync(
            branch.TenantId.ToString(),
            branch.Id,
            ct);

        return response.Succeeded ? Results.Ok(response) : Results.BadRequest(response);
    }

    public static async Task<IResult> TestConnectionAsync(
        TestPcapiConnectionRequest request,
        IPhilHealthPcapiTester pcapiTester,
        CancellationToken ct)
    {
        var result = await pcapiTester.TestConnectionAsync(
            accreditationNumber: request.AccreditationNumber ?? string.Empty,
            secretKey: request.SecretKey ?? string.Empty,
            softwareCertificateId: request.SoftwareCertificateId,
            baseUrl: request.BaseUrl ?? PhilHealthDefaults.PcapiBaseUrl,
            ct: ct);

        return Results.Ok(ApiResponse<PhilHealthTestConnectionResult>.Success(result));
    }
}
