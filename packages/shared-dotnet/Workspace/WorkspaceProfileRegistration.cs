using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Shared.Workspace;

/// <summary>
/// <c>workspace.profile.updated</c>: portal-api pushes the full workspace profile and this handler stores it. Only the control
/// plane may send it, it must be addressed to a facility of the very tenant it describes, and the store applies it only when
/// its version is newer than the held one (so redelivery and reordering are harmless). A message without a profile (an old
/// portal) is ignored. Register it with <c>HandleWorkspaceProfileUpdated()</c> inside the <c>AddInterop</c> handler setup.
/// </summary>
public sealed class WorkspaceProfileUpdatedHandler : IInteropHandler<WorkspaceProfileUpdatedEvent>
{
    private readonly IWorkspaceProfileStore _store;
    private readonly IWorkspaceProfileProvider _provider;
    private readonly ILogger<WorkspaceProfileUpdatedHandler> _logger;

    public WorkspaceProfileUpdatedHandler(
        IWorkspaceProfileStore store,
        IWorkspaceProfileProvider provider,
        ILogger<WorkspaceProfileUpdatedHandler> logger)
    {
        _store = store;
        _provider = provider;
        _logger = logger;
    }

    public async Task HandleAsync(WorkspaceProfileUpdatedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        if (context.From.Kind != PartyKind.ControlPlane || context.From.Service != InteropServices.Portal)
        {
            _logger.LogWarning("[WorkspaceProfile] Ignoring {MessageId}: sender {Sender} is not the portal.", context.MessageId, context.From.Address);
            return;
        }

        var to = context.To;
        if (to.Kind != PartyKind.Facility
            || string.IsNullOrWhiteSpace(message.TenantId)
            || !string.Equals(to.TenantId, message.TenantId, StringComparison.Ordinal))
        {
            _logger.LogWarning(
                "[WorkspaceProfile] Ignoring {MessageId}: addressed to {Recipient}, not to a facility of tenant {TenantId}.",
                context.MessageId, to.Address, message.TenantId);
            return;
        }

        var profile = message.Profile;
        if (profile is null)
        {
            _logger.LogInformation("[WorkspaceProfile] {MessageId} for tenant {TenantId} carries no profile; nothing to store.", context.MessageId, message.TenantId);
            return;
        }

        if (string.IsNullOrWhiteSpace(profile.TenantSlug) || string.IsNullOrWhiteSpace(profile.DisplayName))
        {
            _logger.LogWarning("[WorkspaceProfile] Ignoring {MessageId}: the profile of tenant {TenantId} has no slug or display name.", context.MessageId, message.TenantId);
            return;
        }

        var stored = await _store.UpsertAsync(message.TenantId, profile, ct);

        _provider.Invalidate(message.TenantId);
        _provider.Invalidate(profile.TenantSlug);

        if (stored)
            _logger.LogInformation("[WorkspaceProfile] Tenant {TenantId} now holds profile v{Version}.", message.TenantId, profile.Version);
        else
            _logger.LogDebug("[WorkspaceProfile] Profile v{Version} of tenant {TenantId} is not newer than the held one; ignored.", profile.Version, message.TenantId);
    }
}

public static class WorkspaceProfileServiceCollectionExtensions
{
    /// <summary>
    /// Wires message-fed workspace profiles with the shared EF store. <typeparamref name="TDbContext"/> must implement
    /// <see cref="IWorkspaceProfileDbContext"/> and call <c>modelBuilder.ApplyWorkspaceProfileModel()</c> (plus a migration for
    /// the <c>workspace_profiles</c> table). Then route the message:
    /// <c>services.AddInterop&lt;MyDb&gt;(config, h =&gt; h.HandleWorkspaceProfileUpdated())</c>.
    /// </summary>
    public static IServiceCollection AddWorkspaceProfile<TDbContext>(this IServiceCollection services)
        where TDbContext : DbContext, IWorkspaceProfileDbContext
    {
        services.TryAddScoped<IWorkspaceProfileStore, EfWorkspaceProfileStore<TDbContext>>();
        services.TryAddSingleton<IWorkspaceProfileProvider, StoreBackedWorkspaceProfileProvider>();
        return services;
    }

    /// <summary>Same wiring with a custom <see cref="IWorkspaceProfileStore"/>.</summary>
    public static IServiceCollection AddWorkspaceProfileStore<TStore>(this IServiceCollection services)
        where TStore : class, IWorkspaceProfileStore
    {
        services.TryAddScoped<IWorkspaceProfileStore, TStore>();
        services.TryAddSingleton<IWorkspaceProfileProvider, StoreBackedWorkspaceProfileProvider>();
        return services;
    }

    /// <summary>Routes <c>workspace.profile.updated</c> to <see cref="WorkspaceProfileUpdatedHandler"/>. Call inside the <c>AddInterop</c> handler configuration.</summary>
    public static InteropHandlerBuilder HandleWorkspaceProfileUpdated(this InteropHandlerBuilder handlers) =>
        handlers.Handle<WorkspaceProfileUpdatedEvent, WorkspaceProfileUpdatedHandler>(InteropTypes.WorkspaceProfileUpdated);
}
