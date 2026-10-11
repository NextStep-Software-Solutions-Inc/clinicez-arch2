using System.Collections.Concurrent;
using ClinicEz.Shared.Interop.Background;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Interop.Requests;

/// <summary>
/// Request/reply on top of the interop hub: send a request envelope and await the reply that carries the same
/// <see cref="InteropEnvelope.CorrelationId"/>. The request goes through the transactional outbox like any other
/// message, so it survives a restart, but the waiting caller does not: if the process stops the awaiting call is
/// gone and the reply is dropped on arrival.
/// </summary>
/// <remarks>
/// Register the reply type with <see cref="Handling.InteropHandlerBuilder.HandleReply"/>; the SDK completes the
/// pending call from there. The pending-call map lives in memory, so a replying peer answers the instance that
/// asked only when this service reads its mailbox from a single instance (one replica per service mailbox).
/// Expected latency with the hub's long-poll: a few hundred milliseconds on a healthy link (outbox wake-up,
/// hub accept, responder long-poll wake-up, handler, reply wake-up, requester long-poll wake-up).
/// </remarks>
public interface IInteropRequestClient
{
    /// <summary>
    /// Sends <paramref name="payload"/> as <paramref name="requestType"/> to <paramref name="to"/> and waits for the
    /// <paramref name="replyType"/> reply. <paramref name="timeout"/> defaults to
    /// <see cref="InteropOptions.RequestTimeoutSeconds"/>.
    /// </summary>
    /// <exception cref="InteropRequestTimeoutException">No reply arrived in time (peer offline, hub unreachable, no responder).</exception>
    /// <exception cref="OperationCanceledException"><paramref name="ct"/> was cancelled.</exception>
    Task<TResponse> RequestAsync<TRequest, TResponse>(
        string requestType,
        string replyType,
        Party from,
        Party to,
        TRequest payload,
        TimeSpan? timeout = null,
        CancellationToken ct = default);
}

/// <summary>Thrown when a request got no reply within its timeout. The message carries ids only, never payload data.</summary>
public sealed class InteropRequestTimeoutException : TimeoutException
{
    public InteropRequestTimeoutException(string requestType, Guid correlationId, TimeSpan timeout)
        : base($"No reply to interop request '{requestType}' (correlation {correlationId}) within {timeout.TotalSeconds:0.#}s.")
    {
        RequestType = requestType;
        CorrelationId = correlationId;
        Timeout = timeout;
    }

    public string RequestType { get; }
    public Guid CorrelationId { get; }
    public TimeSpan Timeout { get; }
}

public sealed class InteropRequestClient : IInteropRequestClient
{
    /// <summary>Extra time a request stays valid on the hub after the caller's timeout, to absorb clock skew.</summary>
    private static readonly TimeSpan ExpiryGrace = TimeSpan.FromSeconds(5);

    private sealed record Pending(Party Expected, string ReplyType, TaskCompletionSource<InteropEnvelope> Completion);

    private readonly ConcurrentDictionary<Guid, Pending> _pending = new();
    private readonly IServiceScopeFactory _scopes;
    private readonly InteropRelayService _relay;
    private readonly InteropOptions _options;
    private readonly ILogger<InteropRequestClient> _logger;

    public InteropRequestClient(
        IServiceScopeFactory scopes,
        InteropRelayService relay,
        IOptions<InteropOptions> options,
        ILogger<InteropRequestClient> logger)
    {
        _scopes = scopes;
        _relay = relay;
        _options = options.Value;
        _logger = logger;
    }

    /// <summary>Requests currently waiting for a reply (diagnostics and tests).</summary>
    public int PendingCount => _pending.Count;

    public async Task<TResponse> RequestAsync<TRequest, TResponse>(
        string requestType,
        string replyType,
        Party from,
        Party to,
        TRequest payload,
        TimeSpan? timeout = null,
        CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(requestType);
        ArgumentException.ThrowIfNullOrWhiteSpace(replyType);
        ArgumentNullException.ThrowIfNull(from);
        ArgumentNullException.ThrowIfNull(to);

        var wait = timeout ?? TimeSpan.FromSeconds(_options.RequestTimeoutSeconds);
        if (wait <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(timeout), "Request timeout must be positive.");

        var correlationId = Guid.NewGuid();
        var pending = new Pending(to, replyType, new TaskCompletionSource<InteropEnvelope>(TaskCreationOptions.RunContinuationsAsynchronously));

        // Register BEFORE the request can leave the process, so a fast reply never finds nobody waiting.
        _pending[correlationId] = pending;
        try
        {
            // A scope of its own: the caller's DbContext (an HTTP request, say) is never saved as a side effect.
            using (var scope = _scopes.CreateScope())
            {
                var publisher = scope.ServiceProvider.GetRequiredService<IInteropPublisher>();
                var db = scope.ServiceProvider.GetRequiredService<IInteropDbContext>();
                publisher.Enqueue(requestType, from, to, correlationId, payload, ttl: wait + ExpiryGrace);
                await db.SaveChangesAsync(ct);
            }

            _relay.Signal();

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeoutCts.CancelAfter(wait);
            InteropEnvelope reply;
            try
            {
                reply = await pending.Completion.Task.WaitAsync(timeoutCts.Token);
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                _logger.LogWarning("Interop request {Type} ({CorrelationId}) timed out after {Timeout}s.", requestType, correlationId, wait.TotalSeconds);
                throw new InteropRequestTimeoutException(requestType, correlationId, wait);
            }

            return reply.GetPayload<TResponse>();
        }
        finally
        {
            _pending.TryRemove(correlationId, out _);
        }
    }

    /// <summary>
    /// Called by the reply handler the SDK registers for each reply type. A reply nobody waits for (timed out, other
    /// instance, restart), of the wrong type, or from a party other than the one asked is dropped without an error:
    /// acking it is correct, retrying could never help.
    /// </summary>
    internal void Complete(InteropEnvelope reply)
    {
        if (!_pending.TryGetValue(reply.CorrelationId, out var pending))
        {
            _logger.LogInformation("Dropping interop reply {MessageId} ({Type}): no request is waiting for correlation {CorrelationId}.",
                reply.MessageId, reply.Type, reply.CorrelationId);
            return;
        }

        if (!string.Equals(pending.ReplyType, reply.Type, StringComparison.Ordinal) || !SameAddress(pending.Expected, reply.From))
        {
            _logger.LogWarning("Ignoring interop reply {MessageId} ({Type}) for correlation {CorrelationId}: not the awaited reply type or responder.",
                reply.MessageId, reply.Type, reply.CorrelationId);
            return;
        }

        pending.Completion.TrySetResult(reply);
    }

    private static bool SameAddress(Party a, Party b)
    {
        if (a.Kind != b.Kind || a.TenantId != b.TenantId || a.FacilityId != b.FacilityId || a.PatientId != b.PatientId)
            return false;
        try
        {
            return string.Equals(InteropServices.For(a), InteropServices.For(b), StringComparison.Ordinal);
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }
}
