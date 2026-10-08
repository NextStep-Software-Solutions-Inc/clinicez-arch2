using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Application.Common.Interfaces;

public interface ISyncPayloadProcessor
{
    Task<PushSyncResultDto> ProcessBatchAsync(
        Guid patientId,
        IReadOnlyList<SyncLog> logs,
        int alreadyProcessedCount,
        CancellationToken cancellationToken);
}
