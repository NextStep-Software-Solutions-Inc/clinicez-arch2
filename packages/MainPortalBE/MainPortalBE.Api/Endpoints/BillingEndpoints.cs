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
        var group = app.MapGroup("/billing").WithTags("Billing").RequireAuthorization();

        group.MapPost("/checkout-session", async (CreateCheckoutSessionCommand command, ISender sender) =>
        {
            Console.WriteLine($"[API] Processing checkout session for tenant: {command.TenantId}, plan: {command.PlanId}, isAnnual: {command.IsAnnual}");
            var result = await sender.Send(command);
            Console.WriteLine($"[API] Xendit Invoice URL generated: {result}");
            return Results.Ok(new { Url = result });
        })
        .WithName("CreateCheckoutSession")
        .WithDescription("Creates a new Xendit checkout session for a billing plan subscription and returns the invoice URL.")
        .WithTags("Billing");

        group.MapGet("/customer-portal/{tenantId}", async (string tenantId, ISender sender) =>
        {
            var result = await sender.Send(new GetCustomerPortalUrlQuery { TenantId = tenantId });
            return Results.Ok(new { Url = result });
        })
        .WithName("GetCustomerPortalUrl")
        .WithDescription("Generates and returns the URL for the billing customer portal for a tenant.")
        .WithTags("Billing");

        group.MapGet("/info/{tenantId}", async (string tenantId, ISender sender) =>
        {
            var result = await sender.Send(new GetBillingInfoQuery(tenantId));
            return result != null ? Results.Ok(result) : Results.NotFound("Tenant not found");
        })
        .WithName("GetBillingInfo")
        .WithDescription("Retrieves the billing information and current subscription details for a specific tenant.")
        .WithTags("Billing");

        group.MapPost("/cancel-subscription/{tenantId}", async (string tenantId, ISender sender) =>
        {
            var success = await sender.Send(new CancelSubscriptionCommand(tenantId));
            return success ? Results.Ok() : Results.BadRequest("Failed to cancel subscription or no active subscription found.");
        })
        .WithName("CancelSubscription")
        .WithDescription("Cancels the active subscription for a specific tenant.")
        .WithTags("Billing");

        group.MapPost("/update-info", async (UpdateTenantBillingDetailsCommand command, ISender sender) =>
        {
            var success = await sender.Send(command);
            return success ? Results.Ok() : Results.NotFound("Tenant not found");
        })
        .WithName("UpdateBillingInfo")
        .WithDescription("Updates the billing and payment details for a tenant.")
        .WithTags("Billing");

        group.MapGet("/plans", async (ISender sender) =>
        {
            var result = await sender.Send(new GetBillingPlansQuery());
            return Results.Ok(result);
        })
        .AllowAnonymous()
        .WithName("GetBillingPlans")
        .WithDescription("Retrieves a list of available billing plans.")
        .WithTags("Billing");

        group.MapPost("/webhook", async (
            Microsoft.AspNetCore.Http.HttpContext httpContext,
            MainPortalBE.Application.Features.Billing.Commands.XenditWebhookPayload payload,
            ISender sender,
            Microsoft.Extensions.Configuration.IConfiguration config) =>
        {
            var expectedToken = config["Xendit:CallbackToken"];
            if (string.IsNullOrEmpty(expectedToken))
            {
                expectedToken = "clinicez_callback_token_development";
            }

            if (!httpContext.Request.Headers.TryGetValue("x-callback-token", out var callbackToken) ||
                string.IsNullOrEmpty(callbackToken) ||
                callbackToken != expectedToken)
            {
                Console.WriteLine("[Webhook] Unauthorized webhook call: x-callback-token verification failed.");
                return Results.Unauthorized();
            }

            var success = await sender.Send(new ProcessXenditWebhookCommand(payload));
            return success ? Results.Ok() : Results.BadRequest();
        })
        .AllowAnonymous()
        .WithName("ProcessXenditWebhook")
        .WithDescription("Webhook receiver endpoint for Xendit payment callback events.")
        .WithTags("Billing");

        // Admin Endpoints for Plan CRUD
        group.MapPost("/plans", async (CreateBillingPlanCommand command, ISender sender) =>
        {
            var result = await sender.Send(command);
            return Results.Ok(new { Id = result });
        })
        .WithName("CreateBillingPlan")
        .WithDescription("Creates a new billing plan (Admin only).")
        .WithTags("Billing");

        group.MapPut("/plans/{id:guid}", async (Guid id, UpdateBillingPlanCommand command, ISender sender) =>
        {
            if (id != command.Id) return Results.BadRequest("Id mismatch");
            var success = await sender.Send(command);
            return success ? Results.Ok() : Results.NotFound();
        })
        .WithName("UpdateBillingPlan")
        .WithDescription("Updates an existing billing plan by ID (Admin only).")
        .WithTags("Billing");

        group.MapDelete("/plans/{id:guid}", async (Guid id, ISender sender) =>
        {
            var success = await sender.Send(new DeleteBillingPlanCommand { Id = id });
            return success ? Results.Ok() : Results.NotFound();
        })
        .WithName("DeleteBillingPlan")
        .WithDescription("Deletes a billing plan by ID (Admin only).")
        .WithTags("Billing");
    }
}
