using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using PatientApp.Api.Hubs;
using PatientApp.Application.Common.Interfaces;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Api.Services;

/// <summary>
/// Implements <see cref="ISyncNotificationService"/> using the ASP.NET Core SignalR
/// <see cref="IHubContext{SyncHub}"/>. Registered as a singleton in the API layer
/// because <c>IHubContext&lt;T&gt;</c> is thread-safe and singleton-lifetime.
/// </summary>
public sealed class SignalRSyncNotificationService : ISyncNotificationService
{
    private readonly IHubContext<SyncHub> _hubContext;
    private readonly IPushNotificationService _pushNotificationService;
    private readonly IServiceProvider _serviceProvider;

    public SignalRSyncNotificationService(
        IHubContext<SyncHub> hubContext,
        IPushNotificationService pushNotificationService,
        IServiceProvider serviceProvider)
    {
        _hubContext = hubContext;
        _pushNotificationService = pushNotificationService;
        _serviceProvider = serviceProvider;
    }

    public async Task NotifySyncCompletedAsync(
        Guid patientId,
        int applied,
        int conflicts,
        CancellationToken cancellationToken = default)
    {
        await _hubContext.Clients
            .Group(SyncHub.PatientGroup(patientId))
            .SendAsync(
                "SyncCompleted",
                new { Applied = applied, Conflicts = conflicts },
                cancellationToken);

        using var scope = _serviceProvider.CreateScope();
        var deviceSessionRepository = scope.ServiceProvider.GetRequiredService<IDeviceSessionRepository>();
        
        var session = await deviceSessionRepository.GetActiveByPatientIdAsync(patientId, cancellationToken);
        var title = "Sync Complete";
        var body = "New data has arrived!";
        
        if (session != null && !string.IsNullOrWhiteSpace(session.PushToken))
        {
            await _pushNotificationService.SendPushNotificationAsync(
                session.PushToken,
                title,
                body,
                "sync_ready",
                cancellationToken);
        }
    }

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
