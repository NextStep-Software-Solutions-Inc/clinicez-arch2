using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Shared.Interop.Persistence;

/// <summary>
/// A message waiting to be shipped to the hub. Written in the SAME <c>SaveChanges</c> as the business
/// change that produced it, so a message exists if and only if the change was committed.
/// </summary>
public class InteropOutboxMessage
{
    public Guid MessageId { get; set; }
    public Guid CorrelationId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string EnvelopeJson { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public int AttemptCount { get; set; }
    public DateTime NextAttemptAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DispatchedAtUtc { get; set; }
    /// <summary>Set when the hub rejected the message permanently (unknown target, policy). Never retried.</summary>
    public DateTime? DeadLetteredAtUtc { get; set; }
    public string? LastError { get; set; }
}

/// <summary>Records every message already handled, so redelivery is harmless.</summary>
public class InteropInboxMessage
{
    public Guid MessageId { get; set; }
    public string Type { get; set; } = string.Empty;
    public DateTime ProcessedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>Implemented by each service's <c>ApplicationDbContext</c>.</summary>
public interface IInteropDbContext
{
    DbSet<InteropOutboxMessage> InteropOutbox { get; }
    DbSet<InteropInboxMessage> InteropInbox { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

public static class InteropModelBuilderExtensions
{
    /// <summary>Call from <c>OnModelCreating</c>: maps the outbox and inbox tables.</summary>
    public static ModelBuilder ApplyInteropModel(this ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InteropOutboxMessage>(b =>
        {
            b.ToTable("interop_outbox");
            b.HasKey(x => x.MessageId);
            b.Property(x => x.Type).HasMaxLength(128).IsRequired();
            b.Property(x => x.EnvelopeJson).IsRequired();
            b.Property(x => x.LastError).HasMaxLength(2000);
            b.HasIndex(x => new { x.DispatchedAtUtc, x.DeadLetteredAtUtc, x.NextAttemptAtUtc });
            b.HasIndex(x => x.CorrelationId);
        });

        modelBuilder.Entity<InteropInboxMessage>(b =>
        {
            b.ToTable("interop_inbox");
            b.HasKey(x => x.MessageId);
            b.Property(x => x.Type).HasMaxLength(128).IsRequired();
            b.HasIndex(x => x.ProcessedAtUtc);
        });

        return modelBuilder;
    }
}
