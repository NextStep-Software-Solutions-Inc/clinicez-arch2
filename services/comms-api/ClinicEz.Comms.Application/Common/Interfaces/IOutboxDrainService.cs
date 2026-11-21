using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Comms.Application.Common.Interfaces;

public sealed record OutboxDrainResult(bool IsDrained, int PendingCount, string? Message);

public interface IOutboxDrainService
{
    Task<OutboxDrainResult> DrainAsync(string tenantId, TimeSpan timeout, CancellationToken ct = default);
}
