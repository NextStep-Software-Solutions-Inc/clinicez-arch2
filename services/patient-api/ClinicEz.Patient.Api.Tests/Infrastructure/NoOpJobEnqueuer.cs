using ClinicEz.Patient.Application.Common.Interfaces;

namespace ClinicEz.Patient.Api.Tests.Infrastructure;

/// <summary>
/// No-op background job enqueuer for integration tests.
/// Prevents Hangfire from scheduling jobs that would run in the background
/// and interfere with test assertions.
/// </summary>
internal sealed class NoOpJobEnqueuer : IBackgroundJobEnqueuer
{
    public string EnqueueSyncPayload(Guid patientId, string payloadJson) => "test-job-id";
}
