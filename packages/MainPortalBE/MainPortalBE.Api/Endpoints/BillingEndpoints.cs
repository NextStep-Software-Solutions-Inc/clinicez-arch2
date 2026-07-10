using System;
using MainPortalBE.Api.Abstractions;
using MainPortalBE.Application.Features.Billing.Commands;
using MainPortalBE.Application.Features.Billing.Queries;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace MainPortalBE.Api.Endpoints;

public class BillingEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/billing").RequireAuthorization();

        group.MapPost("/checkout-session", async (CreateCheckoutSessionCommand command, ISender sender) =>
        {
            Console.WriteLine($"[API] Processing checkout session for tenant: {command.TenantId}, plan: {command.PlanId}");
            var result = await sender.Send(command);
            Console.WriteLine($"[API] Xendit Invoice URL generated: {result}");
            return Results.Ok(new { Url = result });
        });

        group.MapGet("/customer-portal/{tenantId}", async (string tenantId, ISender sender) =>
        {
            var result = await sender.Send(new GetCustomerPortalUrlQuery { TenantId = tenantId });
            return Results.Ok(new { Url = result });
        });

        group.MapGet("/plans", async (ISender sender) =>
        {
            var result = await sender.Send(new GetBillingPlansQuery());
            return Results.Ok(result);
        }).AllowAnonymous();

        // Admin Endpoints for Plan CRUD
        group.MapPost("/plans", async (CreateBillingPlanCommand command, ISender sender) =>
        {
            var result = await sender.Send(command);
            return Results.Ok(new { Id = result });
        });

        group.MapPut("/plans/{id:guid}", async (Guid id, UpdateBillingPlanCommand command, ISender sender) =>
        {
            if (id != command.Id) return Results.BadRequest("Id mismatch");
            var success = await sender.Send(command);
            return success ? Results.Ok() : Results.NotFound();
        });

        group.MapDelete("/plans/{id:guid}", async (Guid id, ISender sender) =>
        {
            var success = await sender.Send(new DeleteBillingPlanCommand { Id = id });
            return success ? Results.Ok() : Results.NotFound();
        });
    }
}
