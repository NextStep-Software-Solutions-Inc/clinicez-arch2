using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Finance;
using ClinicEz.Portal.Application.Features.Workspace;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Portal.Api.Endpoints;

/// <summary>Workspace finance dashboard, built from what each facility's billing service reports. Totals only.</summary>
public class FinanceEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/tenants/{tenantSlug}/finance")
            .RequireAuthorization()
            .WithTags("Finance");

        group.MapGet("/summary", async (
            string tenantSlug,
            DateOnly? from,
            DateOnly? to,
            Guid? facilityId,
            Guid? branchId,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Staff, ct);
            if (denied.Result != null) return denied.Result;

            // Owners, admins and members holding the Billing role may see the money; other staff may not.
            if (!denied.Access!.HasAtLeast(WorkspaceRole.Admin) && !denied.Access.IsBilling) return Results.Forbid();

            var summary = await sender.Send(new GetFinanceSummaryQuery(denied.Access.Tenant.TenantSlug, from, to, facilityId, branchId), ct);
            return Results.Ok(summary);
        })
        .WithName("GetWorkspaceFinanceSummary")
        .WithDescription("Collected, reversed and net totals over a date range (default last 30 days, max 366), per currency, facility, branch, source type and day. Owner, Admin or Billing members only.");
    }
}
