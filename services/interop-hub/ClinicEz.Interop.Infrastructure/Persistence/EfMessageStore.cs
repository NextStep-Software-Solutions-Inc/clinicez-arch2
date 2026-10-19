using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Domain.Entities;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Infrastructure.Persistence;

/// <summary>
/// Mailbox storage. Claiming is a compare-and-set per row (<c>UPDATE ... WHERE Seq=? AND AttemptCount=?</c>), so any number of hub
/// instances can pull the same mailbox without double delivery and without row locks: whoever updates the row owns the delivery.
/// </summary>
public sealed class EfMessageStore(HubDbContext db, IOptions<HubOptions> options, TimeProvider time) : IMessageStore
{
    private const int MaxNackDelaySeconds = 300;
    private const int MaxClaimRounds = 5;

    public async Task<EnqueueOutcome> EnqueueAsync(HubMessage message, ConversationEntry? conversation, CancellationToken ct)
    {
        var messageId = message.MessageId;
        if (await db.Messages.AnyAsync(m => m.MessageId == messageId, ct)) return EnqueueOutcome.Duplicate;

        db.Messages.Add(message);
        if (conversation is not null) await AddConversationAsync(conversation, ct);

        try
        {
            await db.SaveChangesAsync(ct);
            return EnqueueOutcome.Accepted;
        }
        catch (DbUpdateException)
        {
            // Lost a race with a concurrent send of the same MessageId (unique index): that one is the accepted copy.
            db.ChangeTracker.Clear();
            if (await db.Messages.AsNoTracking().AnyAsync(m => m.MessageId == messageId, ct)) return EnqueueOutcome.Duplicate;
            throw;
        }
    }

    public async Task<IReadOnlyList<HubMessage>> ClaimAsync(string mailbox, int max, CancellationToken ct)
    {
        var opt = options.Value;
        var now = time.GetUtcNow().UtcDateTime;
        var maxAttempts = opt.MaxDeliveryAttempts;

        var visibleUntil = now.AddSeconds(opt.VisibilityTimeoutSeconds);
        var claimed = new List<HubMessage>(max);
        for (var round = 0; round < MaxClaimRounds && claimed.Count < max; round++)
        {
            var candidates = await db.Messages.AsNoTracking()
                .Where(m => m.Mailbox == mailbox
                            && m.AckedAtUtc == null
                            && m.DeadLetteredAtUtc == null
                            && m.ExpiresAtUtc > now
                            && m.VisibleAfterUtc <= now
                            && m.AttemptCount < maxAttempts)
                .OrderBy(m => m.Seq)
                .Take(max - claimed.Count)
                .ToListAsync(ct);
            if (candidates.Count == 0) break;

            var lostRace = false;
            foreach (var candidate in candidates)
            {
                var seq = candidate.Seq;
                var attempt = candidate.AttemptCount;
                Guid? deliveryId = Guid.NewGuid();
                var updated = await db.Messages
                    .Where(m => m.Seq == seq
                                && m.AttemptCount == attempt
                                && m.AckedAtUtc == null
                                && m.DeadLetteredAtUtc == null
                                && m.VisibleAfterUtc <= now)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(m => m.DeliveryId, deliveryId)
                        .SetProperty(m => m.AttemptCount, m => m.AttemptCount + 1)
                        .SetProperty(m => m.VisibleAfterUtc, visibleUntil), ct);
                if (updated != 1)
                {
                    lostRace = true; // another instance won this one
                    continue;
                }

                candidate.DeliveryId = deliveryId;
                candidate.AttemptCount = attempt + 1;
                claimed.Add(candidate);
            }

            if (!lostRace) break;
        }

        return claimed;
    }

    public async Task<int> AckAsync(IReadOnlyCollection<string> mailboxes, IReadOnlyCollection<Guid> deliveryIds, CancellationToken ct)
    {
        var boxes = mailboxes.ToArray();
        var ids = deliveryIds.Select(id => (Guid?)id).ToArray();
        var now = time.GetUtcNow().UtcDateTime;
        return await db.Messages
            .Where(m => boxes.Contains(m.Mailbox) && m.AckedAtUtc == null && ids.Contains(m.DeliveryId))
            .ExecuteUpdateAsync(s => s
                .SetProperty(m => m.Envelope, string.Empty)
                .SetProperty(m => m.AckedAtUtc, (DateTime?)now)
                .SetProperty(m => m.DeliveryId, (Guid?)null), ct);
    }

    public async Task NackAsync(IReadOnlyCollection<string> mailboxes, IReadOnlyList<NackItem> items, CancellationToken ct)
    {
        var opt = options.Value;
        var boxes = mailboxes.ToArray();
        var ids = items.Select(i => (Guid?)i.DeliveryId).ToArray();
        var errors = items.GroupBy(i => i.DeliveryId).ToDictionary(g => g.Key, g => Truncate(g.First().Error));
        var now = time.GetUtcNow().UtcDateTime;

        var deliveries = await db.Messages.AsNoTracking()
            .Where(m => boxes.Contains(m.Mailbox) && m.AckedAtUtc == null && ids.Contains(m.DeliveryId))
            .Select(m => new { m.Seq, m.AttemptCount, m.DeliveryId })
            .ToListAsync(ct);

        foreach (var delivery in deliveries)
        {
            var seq = delivery.Seq;
            Guid? deliveryId = delivery.DeliveryId;
            var error = errors[delivery.DeliveryId!.Value];
            var rows = db.Messages.Where(m => m.Seq == seq && m.DeliveryId == deliveryId);
            if (delivery.AttemptCount >= opt.MaxDeliveryAttempts)
            {
                await rows.ExecuteUpdateAsync(s => s
                    .SetProperty(m => m.DeadLetteredAtUtc, (DateTime?)now)
                    .SetProperty(m => m.LastError, error)
                    .SetProperty(m => m.DeliveryId, (Guid?)null), ct);
            }
            else
            {
                var delay = Math.Min(opt.NackDelaySeconds * delivery.AttemptCount, MaxNackDelaySeconds);
                var visibleAfter = now.AddSeconds(delay);
                await rows.ExecuteUpdateAsync(s => s
                    .SetProperty(m => m.VisibleAfterUtc, visibleAfter)
                    .SetProperty(m => m.LastError, error)
                    .SetProperty(m => m.DeliveryId, (Guid?)null), ct);
            }
        }
    }

    public Task<bool> HasConversationAsync(Guid correlationId, string fromKey, string toKey, CancellationToken ct)
    {
        var now = time.GetUtcNow().UtcDateTime;
        return db.Conversations.AsNoTracking().AnyAsync(
            c => c.CorrelationId == correlationId && c.FromKey == fromKey && c.ToKey == toKey && c.ExpiresAtUtc > now, ct);
    }

    public async Task<MaintenanceReport> RunMaintenanceAsync(CancellationToken ct)
    {
        var opt = options.Value;
        var now = time.GetUtcNow().UtcDateTime;
        var maxAttempts = opt.MaxDeliveryAttempts;
        var deadLetterCutoff = now.AddDays(-opt.DeadLetterRetentionDays);

        // A consumer that crashed on its last attempt never nacks: once its visibility timeout lapses the message is dead.
        var deadLettered = await db.Messages
            .Where(m => m.AckedAtUtc == null && m.DeadLetteredAtUtc == null && m.AttemptCount >= maxAttempts && m.VisibleAfterUtc <= now)
            .ExecuteUpdateAsync(s => s
                .SetProperty(m => m.DeadLetteredAtUtc, (DateTime?)now)
                .SetProperty(m => m.LastError, "Delivery attempts exhausted."), ct);

        var expired = await db.Messages.Where(m => m.DeadLetteredAtUtc == null && m.ExpiresAtUtc <= now).ExecuteDeleteAsync(ct);
        var deadLettersPurged = await db.Messages.Where(m => m.DeadLetteredAtUtc != null && m.DeadLetteredAtUtc <= deadLetterCutoff).ExecuteDeleteAsync(ct);
        var conversations = await db.Conversations.Where(c => c.ExpiresAtUtc <= now).ExecuteDeleteAsync(ct);
        var claims = await db.Claims.Where(c => c.ExpiresAtUtc <= now).ExecuteDeleteAsync(ct);
        var outbound = await db.Outbound.Where(o => o.DeadLetteredAtUtc != null && o.DeadLetteredAtUtc <= deadLetterCutoff).ExecuteDeleteAsync(ct);

        return new MaintenanceReport(deadLettered, expired, deadLettersPurged, conversations, claims, outbound);
    }

    private async Task AddConversationAsync(ConversationEntry conversation, CancellationToken ct)
    {
        var exists = await db.Conversations.AnyAsync(
            c => c.CorrelationId == conversation.CorrelationId && c.FromKey == conversation.FromKey && c.ToKey == conversation.ToKey, ct);
        if (exists) return;

        var now = time.GetUtcNow().UtcDateTime;
        db.Conversations.Add(new HubConversation
        {
            CorrelationId = conversation.CorrelationId,
            FromKey = conversation.FromKey,
            ToKey = conversation.ToKey,
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddDays(options.Value.ConversationRetentionDays)
        });
    }

    private static string Truncate(string? error) =>
        string.IsNullOrEmpty(error) ? "Nacked by consumer." : error.Length <= 1000 ? error : error[..1000];
}
