using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using ClinicEz.Patient.Api.Hubs;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Api.Services;

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

        var sessions = await deviceSessionRepository.GetActiveByPatientIdAsync(patientId, cancellationToken);
        var pushTokens = sessions
            .Select(s => s.PushToken)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Distinct();

        foreach (var pushToken in pushTokens)
        {
            await _pushNotificationService.SendPushNotificationAsync(
                pushToken!,
                "Sync Complete",
                "New data has arrived!",
                "sync_ready",
                cancellationToken);
        }
    }

    public Task NotifySessionRevokedAsync(
        Guid patientId,
        string reason,
        string? deviceId = null,
        CancellationToken cancellationToken = default)
    {
        var group = deviceId is null
            ? SyncHub.PatientGroup(patientId)
            : SyncHub.DeviceGroup(patientId, deviceId);

        return _hubContext.Clients
            .Group(group)
            .SendAsync(
                "SessionRevoked",
                new { Reason = reason },
                cancellationToken);
    }

    public Task NotifyCommsEventAsync(
        Guid patientId,
        string eventType,
        object? payload,
        CancellationToken cancellationToken = default)
    {
        return _hubContext.Clients
            .Group(SyncHub.PatientGroup(patientId))
            .SendAsync(eventType, payload, cancellationToken);
    }
}
