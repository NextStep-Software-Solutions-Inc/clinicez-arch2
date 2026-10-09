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

public record GetIntegrationsQuery(string TenantSlug) : IRequest<IntegrationsDto>;

public class GetIntegrationsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetIntegrationsQuery, IntegrationsDto>
{
    public async Task<IntegrationsDto> Handle(GetIntegrationsQuery request, CancellationToken cancellationToken)
    {
        var tenant = await IntegrationMapper.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);

        var keys = await context.WorkspaceApiKeys.AsNoTracking()
            .Where(k => k.TenantId == tenant.Id)
            .OrderByDescending(k => k.CreatedAt)
            .Take(50)
            .ToListAsync(cancellationToken);

        var endpoints = await context.WebhookEndpoints.AsNoTracking()
            .Where(e => e.TenantId == tenant.Id)
            .OrderBy(e => e.CreatedAt)
            .ToListAsync(cancellationToken);

        return new IntegrationsDto(
            keys.Select(IntegrationMapper.ToDto).ToList(),
            endpoints.Select(IntegrationMapper.ToDto).ToList(),
            IntegrationCatalog.Scopes,
            IntegrationCatalog.Events,
            IntegrationCatalog.MaxActiveApiKeys,
            IntegrationCatalog.MaxWebhookEndpoints);
    }
}

public record GetWebhookDeliveriesQuery(string TenantSlug, Guid EndpointId, int Take = 25) : IRequest<IReadOnlyList<WebhookDeliveryDto>>;

public class GetWebhookDeliveriesQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetWebhookDeliveriesQuery, IReadOnlyList<WebhookDeliveryDto>>
{
    public async Task<IReadOnlyList<WebhookDeliveryDto>> Handle(GetWebhookDeliveriesQuery request, CancellationToken cancellationToken)
    {
        var tenant = await IntegrationMapper.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);

        var exists = await context.WebhookEndpoints.AnyAsync(e => e.Id == request.EndpointId && e.TenantId == tenant.Id, cancellationToken);
        if (!exists) throw new ClinicEz.Shared.Exceptions.NotFoundException("Webhook endpoint not found in this workspace.");

        var take = Math.Clamp(request.Take, 1, 50);
        var deliveries = await context.WebhookDeliveries.AsNoTracking()
            .Where(d => d.EndpointId == request.EndpointId && d.TenantId == tenant.Id)
            .OrderByDescending(d => d.CreatedAt)
            .Take(take)
            .ToListAsync(cancellationToken);

        return deliveries.Select(IntegrationMapper.ToDto).ToList();
    }
}

// ---------- API keys ----------

public record CreateApiKeyCommand(string TenantSlug, WorkspaceActor Actor, string Name, List<string>? Scopes) : IRequest<CreatedApiKeyDto>;

public class CreateApiKeyCommandValidator : AbstractValidator<CreateApiKeyCommand>
{
    public CreateApiKeyCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.Name).Must(n => !string.IsNullOrWhiteSpace(n) && n.Trim().Length is >= 2 and <= 100)
            .WithMessage("Key name must be between 2 and 100 characters.");
        RuleFor(x => x.Scopes).Must(s => s is { Count: > 0 })
            .WithMessage("Choose at least one scope.");
        RuleFor(x => x.Scopes).Must(s => s == null || s.All(IntegrationCatalog.Scopes.Contains))
            .WithMessage("Unknown scope.");
    }
}

public class CreateApiKeyCommandHandler(IApplicationDbContext context) : IRequestHandler<CreateApiKeyCommand, CreatedApiKeyDto>
{
    public async Task<CreatedApiKeyDto> Handle(CreateApiKeyCommand request, CancellationToken cancellationToken)
    {
        var tenant = await IntegrationMapper.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);

        var active = await context.WorkspaceApiKeys.CountAsync(k => k.TenantId == tenant.Id && k.RevokedAt == null, cancellationToken);
        if (active >= IntegrationCatalog.MaxActiveApiKeys)
        {
            throw new ClinicEz.Shared.Exceptions.BadRequestException(
                $"A workspace can have at most {IntegrationCatalog.MaxActiveApiKeys} active API keys. Revoke one first.");
        }

        var (key, prefix, hash) = ApiKeyHasher.Generate();
        var entity = new WorkspaceApiKey
        {
            TenantId = tenant.Id,
            Name = request.Name.Trim(),
            KeyPrefix = prefix,
            KeyHash = hash,
            Scopes = IntegrationCatalog.Join(request.Scopes!),
            CreatedByName = request.Actor.Name
        };
        context.WorkspaceApiKeys.Add(entity);

        // The key itself is never recorded - only who created which key with which scopes.
        var changes = new WorkspaceChangeSet();
        changes.Track<string?>("name", null, entity.Name);
        changes.Track<string?>("scopes", null, entity.Scopes);
        changes.Stage(context, tenant.Id, request.Actor, section: "integrations", action: "api_key_created");

        await context.SaveChangesAsync(cancellationToken);
        return new CreatedApiKeyDto(IntegrationMapper.ToDto(entity), key);
    }
}

public record RevokeApiKeyCommand(string TenantSlug, WorkspaceActor Actor, Guid ApiKeyId) : IRequest;

public class RevokeApiKeyCommandHandler(IApplicationDbContext context) : IRequestHandler<RevokeApiKeyCommand>
{
    public async Task Handle(RevokeApiKeyCommand request, CancellationToken cancellationToken)
    {
        var tenant = await IntegrationMapper.ResolveTenantAsync(context, request.TenantSlug, cancellationToken);

        var key = await context.WorkspaceApiKeys.FirstOrDefaultAsync(k => k.Id == request.ApiKeyId && k.TenantId == tenant.Id, cancellationToken)
                  ?? throw new ClinicEz.Shared.Exceptions.NotFoundException("API key not found in this workspace.");

        if (key.RevokedAt != null) return;

        key.RevokedAt = DateTime.UtcNow;

        var changes = new WorkspaceChangeSet();
        changes.Track<string?>("apiKey", $"{key.Name} ({key.KeyPrefix}...)", "revoked");
        changes.Stage(context, tenant.Id, request.Actor, section: "integrations", action: "api_key_revoked");

        await context.SaveChangesAsync(cancellationToken);
    }
}
