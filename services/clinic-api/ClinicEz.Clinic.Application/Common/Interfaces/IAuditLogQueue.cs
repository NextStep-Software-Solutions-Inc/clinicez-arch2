namespace ClinicEz.Clinic.Application.Common.Interfaces;

using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;

/// <summary>
/// Asynchronous bounded in-memory buffer insulating domain transactions from audit persistence latency.
/// </summary>
public interface IAuditLogQueue
{
    /// <summary>
    /// Asynchronously enqueues an audit log message. If the channel is bounded and full, waits until space is available.
    /// </summary>
    ValueTask EnqueueAsync(AuditLogMessage message, CancellationToken cancellationToken = default);

    /// <summary>
    /// Attempts to synchronously enqueue an audit log message without blocking. Returns false if channel is full.
    /// </summary>
    bool TryEnqueue(AuditLogMessage message);

    /// <summary>
    /// Asynchronously waits until at least one audit log message is available to read or the channel is completed.
    /// </summary>
    ValueTask<bool> WaitToReadAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Attempts to synchronously dequeue an audit log message from the queue without blocking.
    /// </summary>
    bool TryDequeue([MaybeNullWhen(false)] out AuditLogMessage message);

    /// <summary>
    /// Asynchronously streams all available audit log messages until the channel completes or cancellation is requested.
    /// </summary>
    IAsyncEnumerable<AuditLogMessage> ReadAllAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Current count of items queued in the channel waiting to be persisted.
    /// </summary>
    int Count { get; }

    /// <summary>
    /// Bounded capacity limit of the queue (default 10,000).
    /// </summary>
    int Capacity { get; }
}
