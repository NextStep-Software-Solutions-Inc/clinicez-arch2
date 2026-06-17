namespace PatientApp.Application.Common.Interfaces;

/// <summary>
/// Pushes real-time events to connected patient devices via SignalR.
/// Implemented in the API layer (<c>SignalRSyncNotificationService</c>)
/// to keep the Application layer free of SignalR package references.
/// </summary>
public interface ISyncNotificationService
{
    /// <summary>Notifies a patient's connected device that a sync batch has finished processing.</summary>
    Task NotifySyncCompletedAsync(
        Guid patientId,
        int applied,
        int conflicts,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Forces all connected SignalR clients for a patient to log out.
    /// Used when a new device session is registered or a session is explicitly revoked.
    /// </summary>
    Task NotifySessionRevokedAsync(
        Guid patientId,
        string reason,
        CancellationToken cancellationToken = default);
}
