namespace PatientAppBE.Application.Common.Interfaces;

/// <summary>
/// Abstracts Hangfire's IBackgroundJobClient so the Application layer
/// has zero dependency on Hangfire packages.
/// </summary>
public interface IBackgroundJobEnqueuer
{
    /// <summary>Enqueues a sync payload for deferred processing. Returns the Hangfire job ID.</summary>
    string EnqueueSyncPayload(Guid patientId, string payloadJson);
}
