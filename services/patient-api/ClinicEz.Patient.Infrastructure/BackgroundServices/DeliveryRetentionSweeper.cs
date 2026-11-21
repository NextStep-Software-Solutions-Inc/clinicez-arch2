using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.BackgroundServices;

/// <summary>
/// Periodically sweeps unconfirmed messages where DeliveryState is Waiting and RetentionDeadlineUtc has passed.
/// Transitions state to NotReceived, alerts connected clients, and dispatches a Zero-PHI delivery notice push notification.
/// </summary>
public sealed class DeliveryRetentionSweeper : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DeliveryRetentionSweeper> _logger;
    private readonly TimeSpan _sweepInterval;

    public DeliveryRetentionSweeper(
        IServiceProvider serviceProvider,
        ILogger<DeliveryRetentionSweeper> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _sweepInterval = TimeSpan.FromSeconds(30);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("DeliveryRetentionSweeper background service started.");

        using var timer = new PeriodicTimer(_sweepInterval);

        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await SweepExpiredMessagesAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during delivery retention sweep.");
            }
        }

        _logger.LogInformation("DeliveryRetentionSweeper background service stopped.");
    }

    public async Task SweepExpiredMessagesAsync(CancellationToken ct = default)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var syncNotifier = scope.ServiceProvider.GetRequiredService<ISyncNotificationService>();
        var pushNotifier = scope.ServiceProvider.GetRequiredService<IPushNotificationService>();
        var sessionRepo = scope.ServiceProvider.GetRequiredService<IDeviceSessionRepository>();

        var now = DateTime.UtcNow;

        var expiredMessages = await db.PatientMessages
            .Include(m => m.Conversation)
            .Where(m => m.DeliveryState == DeliveryState.Waiting && m.RetentionDeadlineUtc <= now)
            .Take(100)
            .ToListAsync(ct);

        if (expiredMessages.Count == 0) return;

        _logger.LogInformation("DeliveryRetentionSweeper found {Count} expired unconfirmed messages.", expiredMessages.Count);

        foreach (var msg in expiredMessages)
        {
            msg.DeliveryState = DeliveryState.NotReceived;
            msg.UpdatedAtUtc = now;
        }

        await db.SaveChangesAsync(ct);

        foreach (var msg in expiredMessages)
        {
            var patientId = msg.Conversation.PatientId;
            var facilityName = !string.IsNullOrWhiteSpace(msg.Conversation.FacilityName)
                ? msg.Conversation.FacilityName
                : "your clinic";

            // 1. Broadcast SignalR event
            try
            {
                await syncNotifier.NotifyCommsEventAsync(
                    patientId,
                    "MessageDeliveryExpired",
                    new
                    {
                        messageId = msg.Id,
                        conversationId = msg.ConversationId,
                        deliveryState = DeliveryState.NotReceived
                    },
                    ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to broadcast MessageDeliveryExpired for message {MessageId}.", msg.Id);
            }

            // 2. Zero-PHI Push Alert: strictly non-PHI, zero clinical text, zero diagnoses
            try
            {
                var pushTitle = "Message Delivery Notice";
                var pushBody = $"Your message to {facilityName} was not received. Tap to resend.";

                var sessions = await sessionRepo.GetActiveByPatientIdAsync(patientId, ct);
                var pushTokens = sessions
                    .Select(s => s.PushToken)
                    .Where(t => !string.IsNullOrWhiteSpace(t))
                    .Distinct()
                    .ToList();

                foreach (var token in pushTokens)
                {
                    try
                    {
                        await pushNotifier.SendPushNotificationAsync(token!, pushTitle, pushBody, "messages", ct);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Push failed for token on patient {PatientId}.", patientId);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to dispatch delivery failure push alert for patient {PatientId}.", patientId);
            }
        }
    }
}
