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
}
