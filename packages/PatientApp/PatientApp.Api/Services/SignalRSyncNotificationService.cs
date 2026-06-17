using Microsoft.AspNetCore.SignalR;
using PatientApp.Api.Hubs;
using PatientApp.Application.Common.Interfaces;

namespace PatientApp.Api.Services;

/// <summary>
/// Implements <see cref="ISyncNotificationService"/> using the ASP.NET Core SignalR
/// <see cref="IHubContext{SyncHub}"/>. Registered as a singleton in the API layer
/// because <c>IHubContext&lt;T&gt;</c> is thread-safe and singleton-lifetime.
/// </summary>
public sealed class SignalRSyncNotificationService : ISyncNotificationService
{
    private readonly IHubContext<SyncHub> _hubContext;

    public SignalRSyncNotificationService(IHubContext<SyncHub> hubContext)
        => _hubContext = hubContext;

    public Task NotifySyncCompletedAsync(
        Guid patientId,
        int applied,
        int conflicts,
        CancellationToken cancellationToken = default)
        => _hubContext.Clients
            .Group(SyncHub.PatientGroup(patientId))
            .SendAsync(
                "SyncCompleted",
                new { Applied = applied, Conflicts = conflicts },
                cancellationToken);

    public Task NotifySessionRevokedAsync(
        Guid patientId,
        string reason,
        CancellationToken cancellationToken = default)
        => _hubContext.Clients
            .Group(SyncHub.PatientGroup(patientId))
            .SendAsync(
                "SessionRevoked",
                new { Reason = reason },
                cancellationToken);
}
