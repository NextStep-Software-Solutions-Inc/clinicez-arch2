using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Integrations;

internal static class WebhookRules
{
    public static void AddEventsAndUrlRules<T>(AbstractValidator<T> validator, Func<T, string?> url, Func<T, List<string>?> events, Func<T, string?> description)
    {
        validator.RuleFor(x => url(x)).Must(PublicHttpsUrl.IsValid)
            .OverridePropertyName("Url")
            .WithMessage("Webhook URL must be a public https:// address (max 2048 characters).");
        validator.RuleFor(x => events(x)).Must(e => e is { Count: > 0 })
            .OverridePropertyName("Events")
            .WithMessage("Choose at least one event.");
        validator.RuleFor(x => events(x)).Must(e => e == null || e.All(IntegrationCatalog.Events.Contains))
            .OverridePropertyName("Events")
            .WithMessage("Unknown event type.");
        validator.RuleFor(x => description(x)).Must(d => d == null || d.Trim().Length <= 200)
            .OverridePropertyName("Description")
            .WithMessage("Description can be at most 200 characters.");
    }

    public static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public record CreateWebhookEndpointCommand(string TenantSlug, WorkspaceActor Actor, string Url, string? Description, List<string>? Events)
    : IRequest<CreatedWebhookEndpointDto>;

public class CreateWebhookEndpointCommandValidator : AbstractValidator<CreateWebhookEndpointCommand>
{
    public CreateWebhookEndpointCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        WebhookRules.AddEventsAndUrlRules(this, x => x.Url, x => x.Events, x => x.Description);
    }
}

public class CreateWebhookEndpointCommandHandler(IApplicationDbContext context)
    : IRequestHandler<CreateWebhookEndpointCommand, CreatedWebhookEndpointDto>
{
    public async Task<CreatedWebhookEndpointDto> Handle(CreateWebhookEndpointCommand request, CancellationToken cancellationToken)
    {
        var tenant = await IntegrationMapper.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);

        var count = await context.WebhookEndpoints.CountAsync(e => e.TenantId == tenant.Id, cancellationToken);
        if (count >= IntegrationCatalog.MaxWebhookEndpoints)
        {
            throw new ClinicEz.Shared.Exceptions.BadRequestException(
                $"A workspace can have at most {IntegrationCatalog.MaxWebhookEndpoints} webhook endpoints. Remove one first.");
        }

        var secret = ApiKeyHasher.GenerateSigningSecret();
        var endpoint = new WebhookEndpoint
        {
            TenantId = tenant.Id,
            Url = request.Url.Trim(),
            Description = WebhookRules.Normalize(request.Description),
            Events = IntegrationCatalog.Join(request.Events!),
            IsActive = true,
            SigningSecret = secret
        };
        context.WebhookEndpoints.Add(endpoint);

        var changes = new WorkspaceChangeSet();
        changes.Track<string?>("endpoint", null, IntegrationMapper.Describe(endpoint.Url));
        changes.Track<string?>("events", null, endpoint.Events);
        changes.Stage(context, tenant.Id, request.Actor, section: "integrations", action: "webhook_created");

        await context.SaveChangesAsync(cancellationToken);
        return new CreatedWebhookEndpointDto(IntegrationMapper.ToDto(endpoint), secret);
    }
}

public record UpdateWebhookEndpointCommand(
    string TenantSlug,
    WorkspaceActor Actor,
    Guid EndpointId,
    string Url,
    string? Description,
    List<string>? Events,
    bool IsActive) : IRequest<WebhookEndpointDto>;

public class UpdateWebhookEndpointCommandValidator : AbstractValidator<UpdateWebhookEndpointCommand>
{
    public UpdateWebhookEndpointCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        WebhookRules.AddEventsAndUrlRules(this, x => x.Url, x => x.Events, x => x.Description);
    }
}

public class UpdateWebhookEndpointCommandHandler(IApplicationDbContext context)
    : IRequestHandler<UpdateWebhookEndpointCommand, WebhookEndpointDto>
{
    public async Task<WebhookEndpointDto> Handle(UpdateWebhookEndpointCommand request, CancellationToken cancellationToken)
    {
        var tenant = await IntegrationMapper.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);

        var endpoint = await context.WebhookEndpoints.FirstOrDefaultAsync(e => e.Id == request.EndpointId && e.TenantId == tenant.Id, cancellationToken)
                       ?? throw new ClinicEz.Shared.Exceptions.NotFoundException("Webhook endpoint not found in this workspace.");

        var url = request.Url.Trim();
        var events = IntegrationCatalog.Join(request.Events!);
        var description = WebhookRules.Normalize(request.Description);

        var changes = new WorkspaceChangeSet();
        changes.Track("endpoint", IntegrationMapper.Describe(endpoint.Url), IntegrationMapper.Describe(url));
        changes.Track("events", endpoint.Events, events);
        changes.Track("description", endpoint.Description, description);
        changes.Track("isActive", endpoint.IsActive, request.IsActive);

        endpoint.Url = url;
        endpoint.Events = events;
        endpoint.Description = description;
        endpoint.IsActive = request.IsActive;

        changes.Stage(context, tenant.Id, request.Actor, section: "integrations", action: "webhook_updated");
        await context.SaveChangesAsync(cancellationToken);

        return IntegrationMapper.ToDto(endpoint);
    }
}

public record DeleteWebhookEndpointCommand(string TenantSlug, WorkspaceActor Actor, Guid EndpointId) : IRequest;

public class DeleteWebhookEndpointCommandHandler(IApplicationDbContext context) : IRequestHandler<DeleteWebhookEndpointCommand>
{
    public async Task Handle(DeleteWebhookEndpointCommand request, CancellationToken cancellationToken)
    {
        var tenant = await IntegrationMapper.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);

        var endpoint = await context.WebhookEndpoints.FirstOrDefaultAsync(e => e.Id == request.EndpointId && e.TenantId == tenant.Id, cancellationToken)
                       ?? throw new ClinicEz.Shared.Exceptions.NotFoundException("Webhook endpoint not found in this workspace.");

        var changes = new WorkspaceChangeSet();
        changes.Track<string?>("endpoint", IntegrationMapper.Describe(endpoint.Url), "removed");
        changes.Stage(context, tenant.Id, request.Actor, section: "integrations", action: "webhook_deleted");

        // Hard delete: the signing secret must not linger, and the database cascades the delivery log.
        endpoint.AllowHardDelete = true;
        context.WebhookEndpoints.Remove(endpoint);
        await context.SaveChangesAsync(cancellationToken);
    }
}

public record SendTestWebhookCommand(string TenantSlug, Guid EndpointId) : IRequest;

public class SendTestWebhookCommandHandler(IApplicationDbContext context, IWebhookDispatcher dispatcher) : IRequestHandler<SendTestWebhookCommand>
{
    public async Task Handle(SendTestWebhookCommand request, CancellationToken cancellationToken)
    {
        var tenant = await IntegrationMapper.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);

        var endpoint = await context.WebhookEndpoints.AsNoTracking()
                           .FirstOrDefaultAsync(e => e.Id == request.EndpointId && e.TenantId == tenant.Id, cancellationToken)
                       ?? throw new ClinicEz.Shared.Exceptions.NotFoundException("Webhook endpoint not found in this workspace.");

        if (!endpoint.IsActive)
        {
            throw new ClinicEz.Shared.Exceptions.BadRequestException("Enable the endpoint before sending a test event.");
        }

        await dispatcher.EnqueueAsync(
            tenant.Id,
            tenant.TenantSlug,
            IntegrationCatalog.EventPing,
            new { message = "This is a test event from ClinicEz." },
            endpoint.Id,
            cancellationToken);
    }
}
