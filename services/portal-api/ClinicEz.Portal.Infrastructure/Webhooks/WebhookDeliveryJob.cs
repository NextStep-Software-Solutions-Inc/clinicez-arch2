using ClinicEz.Portal.Application.Features.Integrations;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Infrastructure.Webhooks;

public interface IWebhookDeliveryJob
{
    /// <summary>Hangfire reads job filters from the scheduled (interface) method, so the guard lives here.</summary>
    [DisableConcurrentExecution(timeoutInSeconds: 120)]
    Task DeliverDueAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Sends queued <see cref="WebhookDelivery"/> rows, one POST each, and schedules retries with backoff.
/// Runs every minute from Hangfire, so a delivery normally arrives within about a minute of the event.
/// </summary>
public class WebhookDeliveryJob(IApplicationDbContext context, IHttpClientFactory httpClientFactory) : IWebhookDeliveryJob
{
    public const string HttpClientName = "webhook-delivery";
    public const int MaxAttempts = 6;
    private const int BatchSize = 50;
    private static readonly TimeSpan Retention = TimeSpan.FromDays(30);

    /// <summary>Wait before attempt 2, 3, ... 6 (index = attempts already made - 1).</summary>
    public static readonly TimeSpan[] Backoff =
    [
        TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(30), TimeSpan.FromHours(2), TimeSpan.FromHours(12)
    ];

    public async Task DeliverDueAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        var due = await context.WebhookDeliveries
            .Include(d => d.Endpoint)
            .Where(d => d.Status == WebhookDeliveryStatus.Pending && d.NextAttemptAt <= now)
            .OrderBy(d => d.NextAttemptAt)
            .Take(BatchSize)
            .ToListAsync(cancellationToken);

        var client = httpClientFactory.CreateClient(HttpClientName);

        foreach (var delivery in due)
        {
            await AttemptAsync(client, delivery, cancellationToken);
            // Save per delivery: a crash mid-batch must not resend what already went out.
            await context.SaveChangesAsync(cancellationToken);
        }

        await PurgeOldAsync(now, cancellationToken);
    }

    private async Task AttemptAsync(HttpClient client, WebhookDelivery delivery, CancellationToken cancellationToken)
    {
        var endpoint = delivery.Endpoint;
        var now = DateTime.UtcNow;

        if (!endpoint.IsActive)
        {
            Fail(delivery, now, null, "Endpoint was disabled.");
            return;
        }

        // Re-checked at send time: rules may have tightened since the endpoint was saved.
        if (!PublicHttpsUrl.TryParse(endpoint.Url, out var uri))
        {
            Fail(delivery, now, null, "Endpoint URL is not a public https address.");
            return;
        }

        delivery.AttemptCount++;
        delivery.LastAttemptAt = now;

        try
        {
            var unix = new DateTimeOffset(now).ToUnixTimeSeconds();
            using var request = new HttpRequestMessage(HttpMethod.Post, uri)
            {
                Content = new StringContent(delivery.Payload, Encoding.UTF8, "application/json")
            };
            request.Headers.TryAddWithoutValidation("User-Agent", "ClinicEz-Webhooks/1.0");
            request.Headers.TryAddWithoutValidation("X-ClinicEz-Event", delivery.EventType);
            request.Headers.TryAddWithoutValidation("X-ClinicEz-Delivery", delivery.Id.ToString());
            request.Headers.TryAddWithoutValidation("X-ClinicEz-Signature", WebhookSigner.Sign(endpoint.SigningSecret, unix, delivery.Payload));

            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            delivery.ResponseStatusCode = (int)response.StatusCode;

            if (response.IsSuccessStatusCode)
            {
                delivery.Status = WebhookDeliveryStatus.Succeeded;
                delivery.DeliveredAt = DateTime.UtcNow;
                delivery.LastError = null;
                return;
            }

            ScheduleRetry(delivery, $"Receiver answered HTTP {(int)response.StatusCode}.");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Shutting down: leave it pending and do not count the attempt.
            delivery.AttemptCount--;
            throw;
        }
        catch (TaskCanceledException)
        {
            ScheduleRetry(delivery, "The receiver did not answer in time.");
        }
        catch (HttpRequestException ex)
        {
            ScheduleRetry(delivery, Truncate(ex.Message));
        }
    }

    private static void ScheduleRetry(WebhookDelivery delivery, string error)
    {
        delivery.LastError = error;

        if (delivery.AttemptCount >= MaxAttempts)
        {
            delivery.Status = WebhookDeliveryStatus.Failed;
            return;
        }

        delivery.NextAttemptAt = DateTime.UtcNow + Backoff[Math.Min(delivery.AttemptCount - 1, Backoff.Length - 1)];
    }

    private static void Fail(WebhookDelivery delivery, DateTime now, int? statusCode, string error)
    {
        delivery.Status = WebhookDeliveryStatus.Failed;
        delivery.LastAttemptAt = now;
        delivery.ResponseStatusCode = statusCode;
        delivery.LastError = error;
    }

    private static string Truncate(string value) => value.Length <= 300 ? value : value[..300];

    private async Task PurgeOldAsync(DateTime now, CancellationToken cancellationToken)
    {
        var cutoff = now - Retention;
        var old = await context.WebhookDeliveries
            .Where(d => d.Status != WebhookDeliveryStatus.Pending && d.CreatedAt < cutoff)
            .Take(500)
            .ToListAsync(cancellationToken);

        if (old.Count == 0) return;

        foreach (var delivery in old) delivery.AllowHardDelete = true;
        context.WebhookDeliveries.RemoveRange(old);
        await context.SaveChangesAsync(cancellationToken);
    }
}
