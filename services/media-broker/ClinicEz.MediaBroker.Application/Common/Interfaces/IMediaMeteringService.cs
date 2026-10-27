using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.MediaBroker.Application.Common.Interfaces;

public sealed record CallAdmissionDecision(bool Allowed, string? Reason, bool IsOverdraft);

public interface IMediaMeteringService
{
    Task<CallAdmissionDecision> EvaluateCallAdmissionAsync(string tenantId, CancellationToken ct = default);
    Task RecordCallEndedAsync(Guid callId, DateTime startedAtUtc, DateTime endedAtUtc, CancellationToken ct = default);
}
