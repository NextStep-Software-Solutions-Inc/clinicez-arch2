using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Shared.Interop.Handling;

public enum DispatchOutcome
{
    /// <summary>Handler ran and the message was recorded in the inbox.</summary>
    Handled,
    /// <summary>Already processed earlier; nothing to do.</summary>
    Duplicate,
    /// <summary>Past <see cref="InteropEnvelope.ExpiresAtUtc"/>; dropped.</summary>
    Expired,
    /// <summary>No handler registered for the type in this service. Left for redelivery (or dead-letter) rather than lost.</summary>
    NoHandler,
    /// <summary>The handler threw. Will be retried by the hub.</summary>
    Failed
}

public sealed record DispatchResult(DispatchOutcome Outcome, string? Error = null)
{
    /// <summary>True when the hub delivery can be acknowledged.</summary>
    public bool ShouldAck => Outcome is DispatchOutcome.Handled or DispatchOutcome.Duplicate or DispatchOutcome.Expired;
}

/// <summary>
/// Applies exactly-once-effect semantics on top of at-least-once delivery: de-duplicates on the
/// inbox, runs the handler in its own DI scope, then records the message as processed.
/// </summary>
public sealed class InteropDispatcher
{
    private readonly IServiceScopeFactory _scopes;
    private readonly InteropHandlerRegistry _registry;
    private readonly ILogger<InteropDispatcher> _logger;

    public InteropDispatcher(IServiceScopeFactory scopes, InteropHandlerRegistry registry, ILogger<InteropDispatcher> logger)
    {
        _scopes = scopes;
        _registry = registry;
        _logger = logger;
    }

    public async Task<DispatchResult> DispatchAsync(InteropEnvelope envelope, CancellationToken ct)
    {
        if (envelope.IsExpired())
        {
            _logger.LogWarning("Dropping expired interop message {MessageId} ({Type}).", envelope.MessageId, envelope.Type);
            return new DispatchResult(DispatchOutcome.Expired);
        }

        if (!_registry.TryGet(envelope.Type, out var invoker))
        {
            _logger.LogWarning("No handler for interop message {MessageId} of type {Type}.", envelope.MessageId, envelope.Type);
            return new DispatchResult(DispatchOutcome.NoHandler, $"No handler registered for '{envelope.Type}'.");
        }

        try
        {
            using var scope = _scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<IInteropDbContext>();

            if (await db.InteropInbox.AsNoTracking().AnyAsync(x => x.MessageId == envelope.MessageId, ct))
                return new DispatchResult(DispatchOutcome.Duplicate);

            await invoker(scope.ServiceProvider, envelope, ct);

            // The inbox row is written after the handler, in its own save: if we crash between the two the
            // message is redelivered once and the (idempotent) handler runs again.
            db.InteropInbox.Add(new InteropInboxMessage { MessageId = envelope.MessageId, Type = envelope.Type });
            await db.SaveChangesAsync(ct);
            return new DispatchResult(DispatchOutcome.Handled);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Handler failed for interop message {MessageId} ({Type}).", envelope.MessageId, envelope.Type);
            return new DispatchResult(DispatchOutcome.Failed, ex.Message);
        }
    }
}
