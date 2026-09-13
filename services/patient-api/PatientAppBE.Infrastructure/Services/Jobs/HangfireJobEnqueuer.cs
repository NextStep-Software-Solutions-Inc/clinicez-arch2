using Hangfire;
using PatientAppBE.Application.Common.Interfaces;

namespace PatientAppBE.Infrastructure.Services.Jobs;

public sealed class HangfireJobEnqueuer : IBackgroundJobEnqueuer
{
    private readonly IBackgroundJobClient _client;

    public HangfireJobEnqueuer(IBackgroundJobClient client) => _client = client;

    /// <summary>
    /// Enqueues a sync payload batch for processing.
    /// The actual job method (ProcessSyncPayloadJob) is wired in Step 6.
    /// </summary>
    public string EnqueueSyncPayload(Guid patientId, string payloadJson)
        => _client.Enqueue<ISyncPayloadJob>(job => job.ProcessAsync(patientId, payloadJson, CancellationToken.None));
}
