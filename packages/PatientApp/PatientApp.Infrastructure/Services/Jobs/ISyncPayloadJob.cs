namespace PatientApp.Infrastructure.Services.Jobs;

/// <summary>
/// Hangfire job contract for processing offline sync payloads.
/// Implemented fully in Step 6 (Hangfire job processor).
/// The interface is defined here so Hangfire can serialize/resolve it.
/// </summary>
public interface ISyncPayloadJob
{
    Task ProcessAsync(Guid patientId, string clientIdsJson, CancellationToken cancellationToken);
}
