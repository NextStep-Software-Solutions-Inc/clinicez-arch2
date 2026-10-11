using System.Collections.Concurrent;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Admin;
using ClinicEz.Interop.Application.Bootstrap;
using ClinicEz.Interop.Application.Claims;
using ClinicEz.Interop.Application.Directory;
using ClinicEz.Interop.Application.Local;
using ClinicEz.Interop.Application.Messaging;
using ClinicEz.Interop.Application.Routing;
using ClinicEz.Interop.Application.Security;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Interop.Application;

/// <summary>In-process wake-up for long-polling pullers. Other hub instances are covered by the poll interval.</summary>
public sealed class MailboxNotifier : IMailboxNotifier
{
    private readonly ConcurrentDictionary<string, TaskCompletionSource> _waiters = new(StringComparer.Ordinal);

    public async Task WaitAsync(string mailbox, TimeSpan timeout, CancellationToken ct)
    {
        var tcs = _waiters.GetOrAdd(mailbox, _ => new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously));
        try
        {
            await tcs.Task.WaitAsync(timeout, ct);
        }
        catch (TimeoutException)
        {
            // The poll interval elapsed: the caller re-checks the mailbox (covers messages enqueued by other instances).
        }
    }

    public void Notify(string mailbox)
    {
        if (_waiters.TryRemove(mailbox, out var tcs)) tcs.TrySetResult();
    }
}

public static class DependencyInjection
{
    public static IServiceCollection AddInteropHubApplication(this IServiceCollection services)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IMailboxNotifier, MailboxNotifier>();
        services.AddSingleton<ClientAuthenticator>();
        services.AddSingleton<ClientKeyDirectory>();
        services.AddSingleton<EnvelopeSignatureVerifier>();

        services.AddScoped<OwnershipValidator>();
        services.AddScoped<RoutingPolicy>();
        services.AddScoped<MessageService>();
        services.AddScoped<InboxService>();
        services.AddScoped<DirectoryService>();
        services.AddScoped<AdminService>();
        services.AddScoped<ClaimService>();
        services.AddScoped<HubBootstrapper>();

        services.AddScoped<OutboundForwarder>();
        services.AddScoped<CellInboxPuller>();
        services.AddScoped<DirectorySyncer>();
        return services;
    }
}
