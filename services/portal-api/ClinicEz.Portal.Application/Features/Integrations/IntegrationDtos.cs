using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Integrations;

public record ApiKeyDto(
    Guid Id,
    string Name,
    string KeyPrefix,
    IReadOnlyList<string> Scopes,
    string CreatedByName,
    DateTime CreatedAt,
    DateTime? LastUsedAt,
    DateTime? RevokedAt);

/// <summary>The only response that ever contains the plain API key.</summary>
public record CreatedApiKeyDto(ApiKeyDto ApiKey, string Key);

public record WebhookEndpointDto(
    Guid Id,
    string Url,
    string? Description,
    IReadOnlyList<string> Events,
    bool IsActive,
    DateTime CreatedAt);

/// <summary>The only response that ever contains a webhook signing secret.</summary>
public record CreatedWebhookEndpointDto(WebhookEndpointDto Endpoint, string Secret);

public record WebhookDeliveryDto(
    Guid Id,
    string EventType,
    string Status,
    int AttemptCount,
    DateTime CreatedAt,
    DateTime? LastAttemptAt,
    DateTime? NextAttemptAt,
    int? ResponseStatusCode,
    string? LastError);

public record IntegrationsDto(
    IReadOnlyList<ApiKeyDto> ApiKeys,
    IReadOnlyList<WebhookEndpointDto> Webhooks,
    IReadOnlyList<string> AvailableScopes,
    IReadOnlyList<string> AvailableEvents,
    int MaxActiveApiKeys,
    int MaxWebhookEndpoints);

internal static class IntegrationMapper
{
    public static ApiKeyDto ToDto(WorkspaceApiKey k) => new(
        k.Id, k.Name, k.KeyPrefix, IntegrationCatalog.Split(k.Scopes), k.CreatedByName, k.CreatedAt, k.LastUsedAt, k.RevokedAt);

    public static WebhookEndpointDto ToDto(WebhookEndpoint e) => new(
        e.Id, e.Url, e.Description, IntegrationCatalog.Split(e.Events), e.IsActive, e.CreatedAt);

    public static WebhookDeliveryDto ToDto(WebhookDelivery d) => new(
        d.Id, d.EventType, d.Status.ToString(), d.AttemptCount, d.CreatedAt, d.LastAttemptAt,
        d.Status == WebhookDeliveryStatus.Pending ? d.NextAttemptAt : null,
        d.ResponseStatusCode, d.LastError);

    public static async Task<Tenant> ResolveTenantAsync(IApplicationDbContext context, string tenantSlug, CancellationToken ct)
    {
        var key = tenantSlug.Trim().ToLowerInvariant();
        return await context.Tenants.FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, ct)
               ?? throw new ClinicEz.Shared.Exceptions.NotFoundException($"Workspace '{tenantSlug}' not found.");
    }

    /// <summary>Audit-safe description of a webhook target: scheme, host and path only (queries often carry tokens).</summary>
    public static string Describe(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) ? $"{uri.Scheme}://{uri.Authority}{uri.AbsolutePath}" : "(invalid)";
}
