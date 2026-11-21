namespace ClinicEz.Patient.Application.Common.Interfaces;

/// <summary>
/// Pushes real-time events to connected patient devices via SignalR.
/// Implemented in the API layer (<c>SignalRSyncNotificationService</c>)
/// to keep the Application layer free of SignalR package references.
/// </summary>
public interface ISyncNotificationService
{
    /// <summary>Notifies every connected device of a patient that a sync batch has finished processing.</summary>
    Task NotifySyncCompletedAsync(
        Guid patientId,
        int applied,
        int conflicts,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Tells a patient's connected clients that a session was revoked so they can sign out.
    /// When <paramref name="deviceId"/> is given only that device is notified; otherwise
    /// every connected device of the patient is.
    /// </summary>
    Task NotifySessionRevokedAsync(
        Guid patientId,
        string reason,
        string? deviceId = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Broadcasts a communications event (message received, delivery state change, thread update)
    /// to the patient's connected clients via SignalR.
    /// </summary>
    Task NotifyCommsEventAsync(
        Guid patientId,
        string eventType,
        object? payload,
        CancellationToken cancellationToken = default);
}
