using ClinicEz.Shared.Interop.Requests;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Shared.Interop.Handling;

/// <summary>
/// Handles one message type. Delivery is at-least-once: handlers MUST be idempotent (the dispatcher
/// already skips message ids it has fully processed, but a crash between handling and recording
/// causes one redelivery). A handler's own <c>SaveChanges</c> is its commit point.
/// </summary>
public interface IInteropHandler<in TPayload>
{
    Task HandleAsync(TPayload payload, InteropMessageContext context, CancellationToken ct);
}

/// <summary>Envelope metadata available to a handler.</summary>
public sealed record InteropMessageContext(InteropEnvelope Envelope)
{
    public Guid MessageId => Envelope.MessageId;
    public Guid CorrelationId => Envelope.CorrelationId;
    public Party From => Envelope.From;
    public Party To => Envelope.To;
    public string Type => Envelope.Type;
}

/// <summary>Runs a registered handler for one envelope. Built once per registration, no reflection at dispatch time.</summary>
internal delegate Task InteropHandlerInvoker(IServiceProvider scopedServices, InteropEnvelope envelope, CancellationToken ct);

public sealed class InteropHandlerRegistry
{
    private readonly Dictionary<string, InteropHandlerInvoker> _invokers = new(StringComparer.Ordinal);

    internal void Add(string type, InteropHandlerInvoker invoker)
    {
        if (!_invokers.TryAdd(type, invoker))
            throw new InvalidOperationException($"A handler for interop message type '{type}' is already registered.");
    }

    internal bool TryGet(string type, out InteropHandlerInvoker invoker) => _invokers.TryGetValue(type, out invoker!);

    public IReadOnlyCollection<string> RegisteredTypes => _invokers.Keys;
}

public sealed class InteropHandlerBuilder
{
    private readonly IServiceCollection _services;
    private readonly InteropHandlerRegistry _registry;

    internal InteropHandlerBuilder(IServiceCollection services, InteropHandlerRegistry registry)
    {
        _services = services;
        _registry = registry;
    }

    /// <summary>Route messages of <paramref name="type"/> to <typeparamref name="THandler"/> (scoped per message).</summary>
    public InteropHandlerBuilder Handle<TPayload, THandler>(string type)
        where THandler : class, IInteropHandler<TPayload>
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(type);
        _services.AddScoped<THandler>();
        _registry.Add(type, async (sp, envelope, ct) =>
        {
            var payload = envelope.GetPayload<TPayload>();
            var handler = sp.GetRequiredService<THandler>();
            await handler.HandleAsync(payload, new InteropMessageContext(envelope), ct);
        });
        return this;
    }

    /// <summary>
    /// Answer requests of <paramref name="requestType"/> with <typeparamref name="THandler"/> (scoped per message): the SDK
    /// enqueues its return value as a <paramref name="replyType"/> message to the sender, with the request's correlation id,
    /// in the same save as the handler's changes. A redelivered request is not answered twice.
    /// </summary>
    public InteropHandlerBuilder Respond<TRequest, TResponse, THandler>(string requestType, string replyType, TimeSpan? replyTtl = null)
        where THandler : class, IInteropResponder<TRequest, TResponse>
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(requestType);
        ArgumentException.ThrowIfNullOrWhiteSpace(replyType);
        _services.AddScoped<THandler>();
        var ttl = replyTtl ?? InteropResponder.DefaultReplyTtl;
        _registry.Add(requestType, (sp, envelope, ct) =>
            InteropResponder.RunAsync<TRequest, TResponse, THandler>(sp, envelope, replyType, ttl, ct));
        return this;
    }

    /// <summary>
    /// Accept replies of <paramref name="replyType"/> for <see cref="IInteropRequestClient"/>: each one completes the
    /// request that is awaiting it. Required in every service that sends requests of the matching request type.
    /// </summary>
    public InteropHandlerBuilder HandleReply(string replyType)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(replyType);
        _registry.Add(replyType, (sp, envelope, _) =>
        {
            sp.GetRequiredService<InteropRequestClient>().Complete(envelope);
            return Task.CompletedTask;
        });
        return this;
    }
}
