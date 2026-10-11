using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Infrastructure.Persistence;

public sealed class EfOutboundStore(HubDbContext db, TimeProvider time) : IOutboundStore
{
    public async Task<EnqueueOutcome> EnqueueAsync(HubOutboundMessage message, CancellationToken ct)
    {
        var messageId = message.MessageId;
        if (await db.Outbound.AnyAsync(o => o.MessageId == messageId, ct)) return EnqueueOutcome.Duplicate;

        db.Outbound.Add(message);
        try
        {
            await db.SaveChangesAsync(ct);
            return EnqueueOutcome.Accepted;
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            if (await db.Outbound.AsNoTracking().AnyAsync(o => o.MessageId == messageId, ct)) return EnqueueOutcome.Duplicate;
            throw;
        }
    }

    public async Task<IReadOnlyList<HubOutboundMessage>> GetDueAsync(int max, CancellationToken ct)
    {
        var now = time.GetUtcNow().UtcDateTime;
        return await db.Outbound.AsNoTracking()
            .Where(o => o.DeadLetteredAtUtc == null
                        && o.NextAttemptAtUtc <= now
                        && !db.Outbound.Any(p => p.CorrelationId == o.CorrelationId && p.Seq < o.Seq && p.DeadLetteredAtUtc == null))
            .OrderBy(o => o.Seq)
            .Take(max)
            .ToListAsync(ct);
    }

    public Task CompleteAsync(long seq, CancellationToken ct) =>
        db.Outbound.Where(o => o.Seq == seq).ExecuteDeleteAsync(ct);

    public Task RejectAsync(long seq, string reason, CancellationToken ct)
    {
        var now = time.GetUtcNow().UtcDateTime;
        var error = Truncate(reason);
        return db.Outbound.Where(o => o.Seq == seq).ExecuteUpdateAsync(s => s
            .SetProperty(o => o.DeadLetteredAtUtc, (DateTime?)now)
            .SetProperty(o => o.LastError, error), ct);
    }

    public Task FailAsync(long seq, int attemptCount, string error, DateTime nextAttemptAtUtc, CancellationToken ct)
    {
        var message = Truncate(error);
        return db.Outbound.Where(o => o.Seq == seq).ExecuteUpdateAsync(s => s
            .SetProperty(o => o.AttemptCount, attemptCount)
            .SetProperty(o => o.LastError, message)
            .SetProperty(o => o.NextAttemptAtUtc, nextAttemptAtUtc), ct);
    }

    public Task<int> CountPendingAsync(CancellationToken ct) =>
        db.Outbound.CountAsync(o => o.DeadLetteredAtUtc == null, ct);

    private static string Truncate(string text) => text.Length <= 1000 ? text : text[..1000];
}

public sealed class EfClaimStore(HubDbContext db, IOptions<HubOptions> options, TimeProvider time) : IClaimStore
{
    public async Task AddAsync(HubClaim claim, CancellationToken ct)
    {
        db.Claims.Add(claim);
        await db.SaveChangesAsync(ct);
    }

    public Task<HubClaim?> FindByTokenHashAsync(string tokenHash, CancellationToken ct) =>
        db.Claims.AsNoTracking().FirstOrDefaultAsync(c => c.TokenHash == tokenHash, ct);

    public async Task<bool> TryRedeemAsync(HubClaim claim, string tenantId, string facilityId, HubMessage message, ConversationEntry conversation, CancellationToken ct)
    {
        var now = time.GetUtcNow().UtcDateTime;
        var claimId = claim.Id;
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        // Compare-and-set: exactly one redeemer flips RedeemedAtUtc from null.
        var flipped = await db.Claims
            .Where(c => c.Id == claimId && c.RedeemedAtUtc == null && c.ExpiresAtUtc > now)
            .ExecuteUpdateAsync(s => s
                .SetProperty(c => c.RedeemedAtUtc, (DateTime?)now)
                .SetProperty(c => c.RedeemedByTenantId, tenantId)
                .SetProperty(c => c.RedeemedByFacilityId, facilityId)
                .SetProperty(c => c.Envelope, string.Empty), ct);
        if (flipped != 1) return false;

        db.Messages.Add(message);
        var exists = await db.Conversations.AnyAsync(
            c => c.CorrelationId == conversation.CorrelationId && c.FromKey == conversation.FromKey && c.ToKey == conversation.ToKey, ct);
        if (!exists)
        {
            db.Conversations.Add(new HubConversation
            {
                CorrelationId = conversation.CorrelationId,
                FromKey = conversation.FromKey,
                ToKey = conversation.ToKey,
                CreatedAtUtc = now,
                ExpiresAtUtc = now.AddDays(options.Value.ConversationRetentionDays)
            });
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }
}
