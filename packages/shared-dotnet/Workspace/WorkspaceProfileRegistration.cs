using System.Threading.Tasks;
using ClinicEz.Shared.Common;
using MassTransit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Shared.Workspace;

/// <summary>
/// Invalidates the cached workspace profile when portal-api announces a change. Register in a service's
/// MassTransit setup with <c>x.AddConsumer&lt;WorkspaceProfileUpdatedConsumer&gt;()</c>. Best effort: when an
/// instance does not receive the event it converges through the cache freshness window and ETag revalidation.
/// </summary>
public sealed class WorkspaceProfileUpdatedConsumer(IWorkspaceProfileProvider provider) : IConsumer<WorkspaceProfileUpdatedEvent>
{
    public Task Consume(ConsumeContext<WorkspaceProfileUpdatedEvent> context)
    {
        var message = context.Message;
        provider.Invalidate(message.TenantSlug);
        provider.Invalidate(message.TenantId);
        return Task.CompletedTask;
    }
}

public static class WorkspaceProfileServiceCollectionExtensions
{
    /// <summary>
    /// Registers <see cref="IWorkspaceProfileProvider"/> as a singleton backed by an <c>IHttpClientFactory</c>.
    /// Reads <c>WorkspaceProfile:CacheSeconds</c> (default 300) and <c>WorkspaceProfile:CachePath</c>.
    /// </summary>
    public static IServiceCollection AddWorkspaceProfileClient(this IServiceCollection services)
    {
        // Singleton: the provider owns the cache. (A typed HttpClient registration would be transient and lose it.)
        services.AddHttpClient(HttpWorkspaceProfileProvider.HttpClientName);
        services.AddSingleton<IWorkspaceProfileProvider, HttpWorkspaceProfileProvider>();
        return services;
    }
}
