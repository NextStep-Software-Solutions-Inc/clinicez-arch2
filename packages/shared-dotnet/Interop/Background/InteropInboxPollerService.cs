using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Interop.Background;

/// <summary>
/// Long-polls this service's mailbox on the hub and dispatches each message to its handler.
/// Acks on success, nacks on failure so the hub redelivers (and eventually dead-letters). A message whose signature does not
/// verify (when <see cref="EnvelopeVerifier.Enabled"/>) is nacked without running a handler.
/// </summary>
public sealed class InteropInboxPollerService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly InteropDispatcher _dispatcher;
    private readonly InteropOptions _options;
    private readonly EnvelopeVerifier _verifier;
    private readonly ILogger<InteropInboxPollerService> _logger;

    public InteropInboxPollerService(
        IServiceScopeFactory scopes,
        InteropDispatcher dispatcher,
        EnvelopeVerifier verifier,
        IOptions<InteropOptions> options,
        ILogger<InteropInboxPollerService> logger)
    {
        _scopes = scopes;
        _dispatcher = dispatcher;
        _verifier = verifier;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled) return;

        var failures = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var handled = await RunOnceAsync(_options.PollWaitSeconds, stoppingToken);
                failures = 0;
                if (handled == 0 && _options.IsInProcess)
                    await Task.Delay(_options.RelayIntervalMs, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                failures++;
                var delay = TimeSpan.FromSeconds(Math.Min(Math.Pow(2, Math.Min(failures, 8)), 60));
                _logger.LogWarning(ex, "Interop inbox poll failed ({Failures} in a row); retrying in {Delay}.", failures, delay);
                await Task.Delay(delay, stoppingToken);
            }
        }
    }

    /// <summary>Pull one batch and process it. Returns how many messages were received. Public for tests.</summary>
    public async Task<int> RunOnceAsync(int waitSeconds, CancellationToken ct)
    {
        using var scope = _scopes.CreateScope();
        var hub = scope.ServiceProvider.GetRequiredService<IHubClient>();

        var batch = await hub.PullAsync(_options.Service, _options.BatchSize, waitSeconds, ct);
        if (batch.Count == 0) return 0;

        var acks = new List<Guid>();
        var nacks = new List<NackItem>();
        foreach (var message in batch)
        {
            var signatureError = await _verifier.VerifyAsync(hub, message.Envelope, ct);
            if (signatureError is not null)
            {
                _logger.LogError("Rejecting interop message {MessageId} ({Type}): {Error}", message.Envelope.MessageId, message.Envelope.Type, signatureError);
                nacks.Add(new NackItem(message.DeliveryId, signatureError));
                continue;
            }

            var result = await _dispatcher.DispatchAsync(message.Envelope, ct);
            if (result.ShouldAck) acks.Add(message.DeliveryId);
            else nacks.Add(new NackItem(message.DeliveryId, result.Error ?? result.Outcome.ToString()));
        }

        await hub.AckAsync(acks, ct);
        await hub.NackAsync(nacks, ct);
        return batch.Count;
    }
}
