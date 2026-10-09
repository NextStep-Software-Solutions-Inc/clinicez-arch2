using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Shared.Workspace;

/// <summary>
/// Invalidates the cached workspace profile when portal-api announces a change. Register in a service's
/// interop setup with <c>b.Handle&lt;WorkspaceProfileUpdatedEvent, WorkspaceProfileUpdatedHandler&gt;(InteropTypes.WorkspaceProfileUpdated)</c>.
/// Best effort: when an instance does not receive the event it converges through the cache freshness window and
/// ETag revalidation.
/// </summary>
public sealed class WorkspaceProfileUpdatedHandler(IWorkspaceProfileProvider provider) : IInteropHandler<WorkspaceProfileUpdatedEvent>
{
    public Task HandleAsync(WorkspaceProfileUpdatedEvent message, InteropMessageContext context, CancellationToken ct)
    {
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
