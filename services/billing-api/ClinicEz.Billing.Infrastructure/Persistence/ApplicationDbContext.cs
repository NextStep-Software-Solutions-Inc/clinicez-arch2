using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Billing.Infrastructure.Persistence;

public class ApplicationDbContext(
    DbContextOptions<ApplicationDbContext> options,
    IConfiguration configuration,
    IBillingContext? billingContext = null) : DbContext(options), IBillingDbContext
{
    public DbSet<InteropOutboxMessage> InteropOutbox { get; set; }
    public DbSet<InteropInboxMessage> InteropInbox { get; set; }
    public DbSet<Invoice> Invoices { get; set; }
    public DbSet<InvoiceLine> InvoiceLines { get; set; }
    public DbSet<InvoiceDiscount> InvoiceDiscounts { get; set; }
    public DbSet<Payment> Payments { get; set; }
    public DbSet<PaymentAllocation> PaymentAllocations { get; set; }
    public DbSet<Receipt> Receipts { get; set; }
    public DbSet<Refund> Refunds { get; set; }
    public DbSet<RefundLine> RefundLines { get; set; }
    public DbSet<CashierShift> CashierShifts { get; set; }
    public DbSet<AuditEntry> AuditEntries { get; set; }
    public DbSet<BillingFacility> BillingFacilities { get; set; }
    public DbSet<DocumentSequence> DocumentSequences { get; set; }
    public DbSet<BillingStaff> BillingStaff { get; set; }

    /// <summary>
    /// Tenant of the authenticated session. <c>null</c> (no HTTP request: interop handlers, design-time tooling, login) applies no
    /// filter; those callers scope every query by tenant explicitly. An authenticated request whose principal carries no tenant
    /// gets the empty string, which matches no row: the context fails closed.
    /// </summary>
    private string? CurrentTenantId => billingContext?.TenantId;

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        RefuseAuditTampering();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        RefuseAuditTampering();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    /// <summary>The audit trail is append-only: any update or delete of an entry is refused before it reaches the database.</summary>
    private void RefuseAuditTampering()
    {
        if (ChangeTracker.Entries<AuditEntry>().Any(e => e.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Audit entries are immutable and cannot be changed or deleted.");
    }

    /// <summary>Every enum, nullable or not, is stored as its C# name (never its ordinal).</summary>
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(32);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var schemaName = configuration["DbSchema"];
        if (string.IsNullOrEmpty(schemaName))
        {
            throw new InvalidOperationException("DbSchema configuration value is required but was not specified.");
        }

        modelBuilder.HasDefaultSchema(schemaName);

        modelBuilder.Entity<Invoice>(b =>
        {
            b.ToTable("invoices");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.FacilityId).HasMaxLength(100).IsRequired();
            b.Property(x => x.FacilityType);
            b.Property(x => x.BranchId).HasMaxLength(100);
            b.Property(x => x.Origin);
            b.Property(x => x.SourceType).HasMaxLength(64).IsRequired();
            b.Property(x => x.InvoiceNumber).HasMaxLength(32).IsRequired();
            b.Property(x => x.PatientName).HasMaxLength(200).IsRequired();
            b.Property(x => x.VisitKey).HasMaxLength(128);
            b.Property(x => x.Currency).HasMaxLength(3).IsRequired();
            b.Property(x => x.Status);
            b.Property(x => x.Subtotal).HasPrecision(18, 2);
            b.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            b.Property(x => x.Total).HasPrecision(18, 2);
            b.Property(x => x.PaidTotal).HasPrecision(18, 2);
            b.Property(x => x.RefundedTotal).HasPrecision(18, 2);
            b.Property(x => x.VoidReason).HasMaxLength(500);
            b.Property(x => x.CreatedBy).HasMaxLength(200).IsRequired();
            b.Property(x => x.Version).IsConcurrencyToken();
            b.Ignore(x => x.NetPaid);
            b.Ignore(x => x.Balance);
            b.Ignore(x => x.IsLocked);
            b.HasMany(x => x.Lines).WithOne().HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Cascade);
            b.HasMany(x => x.Discounts).WithOne().HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.TenantId, x.FacilityId, x.InvoiceRequestId }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.FacilityId, x.InvoiceNumber }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.BranchId, x.VisitKey });
            b.HasIndex(x => new { x.TenantId, x.Status, x.CreatedAtUtc });
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.Entity<InvoiceLine>(b =>
        {
            b.ToTable("invoice_lines");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.Code).HasMaxLength(64).IsRequired();
            b.Property(x => x.Description).HasMaxLength(300).IsRequired();
            b.Property(x => x.UnitPrice).HasPrecision(18, 2);
            b.Property(x => x.LineTotal).HasPrecision(18, 2);
            b.HasIndex(x => x.InvoiceId);
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.Entity<InvoiceDiscount>(b =>
        {
            b.ToTable("invoice_discounts");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.Kind);
            b.Property(x => x.Mode);
            b.Property(x => x.Value).HasPrecision(18, 2);
            b.Property(x => x.Amount).HasPrecision(18, 2);
            b.Property(x => x.Reason).HasMaxLength(500).IsRequired();
            b.Property(x => x.IdNumber).HasMaxLength(64);
            b.Property(x => x.AppliedByName).HasMaxLength(200).IsRequired();
            b.Property(x => x.ApprovedByName).HasMaxLength(200);
            b.HasIndex(x => x.InvoiceId);
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.Entity<Payment>(b =>
        {
            b.ToTable("payments");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.FacilityId).HasMaxLength(100).IsRequired();
            b.Property(x => x.BranchId).HasMaxLength(100);
            b.Property(x => x.PatientName).HasMaxLength(200).IsRequired();
            b.Property(x => x.Method);
            b.Property(x => x.InsurerKind);
            b.Property(x => x.Currency).HasMaxLength(3).IsRequired();
            b.Property(x => x.Amount).HasPrecision(18, 2);
            b.Property(x => x.Tendered).HasPrecision(18, 2);
            b.Property(x => x.Change).HasPrecision(18, 2);
            b.Property(x => x.Reference).HasMaxLength(100);
            b.Property(x => x.CashierName).HasMaxLength(200).IsRequired();
            b.Property(x => x.IdempotencyKey).HasMaxLength(128).IsRequired();
            b.Property(x => x.RequestHash).HasMaxLength(64).IsRequired();
            b.HasMany(x => x.Allocations).WithOne().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.TenantId, x.IdempotencyKey }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.ShiftId });
            b.HasIndex(x => new { x.TenantId, x.PaidAtUtc });
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.Entity<PaymentAllocation>(b =>
        {
            b.ToTable("payment_allocations");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.InvoiceFacilityId).HasMaxLength(100).IsRequired();
            b.Property(x => x.InvoiceFacilityType);
            b.Property(x => x.BranchId).HasMaxLength(100);
            b.Property(x => x.Amount).HasPrecision(18, 2);
            b.Property(x => x.RefundedAmount).HasPrecision(18, 2);
            b.Ignore(x => x.Refundable);
            b.HasIndex(x => new { x.TenantId, x.InvoiceId });
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.Entity<Receipt>(b =>
        {
            b.ToTable("receipts");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.FacilityId).HasMaxLength(100).IsRequired();
            b.Property(x => x.Number).HasMaxLength(32).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.FacilityId, x.Number }).IsUnique();
            b.HasIndex(x => x.PaymentId);
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.Entity<Refund>(b =>
        {
            b.ToTable("refunds");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.FacilityId).HasMaxLength(100).IsRequired();
            b.Property(x => x.Number).HasMaxLength(32).IsRequired();
            b.Property(x => x.InvoiceFacilityId).HasMaxLength(100).IsRequired();
            b.Property(x => x.BranchId).HasMaxLength(100);
            b.Property(x => x.Currency).HasMaxLength(3).IsRequired();
            b.Property(x => x.Amount).HasPrecision(18, 2);
            b.Property(x => x.Reason).HasMaxLength(500).IsRequired();
            b.Property(x => x.ApprovedByName).HasMaxLength(200).IsRequired();
            b.HasMany(x => x.Lines).WithOne().HasForeignKey(x => x.RefundId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.TenantId, x.FacilityId, x.Number }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.InvoiceId });
            b.HasIndex(x => new { x.TenantId, x.ShiftId });
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.Entity<RefundLine>(b =>
        {
            b.ToTable("refund_lines");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.Method);
            b.Property(x => x.Amount).HasPrecision(18, 2);
            b.HasIndex(x => x.RefundId);
            b.HasIndex(x => x.PaymentAllocationId);
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.Entity<CashierShift>(b =>
        {
            b.ToTable("cashier_shifts");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.FacilityId).HasMaxLength(100).IsRequired();
            b.Property(x => x.CashierName).HasMaxLength(200).IsRequired();
            b.Property(x => x.Status);
            b.Property(x => x.OpeningFloat).HasPrecision(18, 2);
            b.Property(x => x.CashCollected).HasPrecision(18, 2);
            b.Property(x => x.CashRefunded).HasPrecision(18, 2);
            b.Property(x => x.NonCashCollected).HasPrecision(18, 2);
            b.Property(x => x.ExternalSettled).HasPrecision(18, 2);
            b.Property(x => x.ExpectedCash).HasPrecision(18, 2);
            b.Property(x => x.CountedCash).HasPrecision(18, 2);
            b.Property(x => x.Variance).HasPrecision(18, 2);
            b.Property(x => x.CloseNotes).HasMaxLength(500);
            b.HasIndex(x => new { x.TenantId, x.FacilityId, x.CashierUserId, x.Status });
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.Entity<AuditEntry>(b =>
        {
            b.ToTable("audit_entries");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.FacilityId).HasMaxLength(100);
            b.Property(x => x.ActorName).HasMaxLength(200).IsRequired();
            b.Property(x => x.Action).HasMaxLength(64).IsRequired();
            b.Property(x => x.EntityType).HasMaxLength(64).IsRequired();
            b.Property(x => x.Details).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.EntityType, x.EntityId });
            b.HasIndex(x => new { x.TenantId, x.AtUtc });
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.Entity<BillingFacility>(b =>
        {
            b.ToTable("billing_facilities");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.FacilityId).HasMaxLength(100).IsRequired();
            b.Property(x => x.FacilityType);
            b.Property(x => x.PlanTier).HasMaxLength(64);
            b.HasIndex(x => new { x.TenantId, x.FacilityId }).IsUnique();
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.Entity<DocumentSequence>(b =>
        {
            b.ToTable("document_sequences");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.FacilityId).HasMaxLength(100).IsRequired();
            b.Property(x => x.Kind).HasMaxLength(16).IsRequired();
            b.Property(x => x.Version).IsConcurrencyToken();
            b.HasIndex(x => new { x.TenantId, x.FacilityId, x.Kind }).IsUnique();
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.Entity<BillingStaff>(b =>
        {
            b.ToTable("billing_staff");
            b.HasKey(x => x.Id);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            b.Property(x => x.FacilityId).HasMaxLength(100).IsRequired();
            b.Property(x => x.Email).HasMaxLength(256).IsRequired();
            b.Property(x => x.FullName).HasMaxLength(200).IsRequired();
            b.Property(x => x.PasswordHash).HasMaxLength(512).IsRequired();
            b.Property(x => x.Role);
            b.HasIndex(x => new { x.TenantId, x.FacilityId, x.Email }).IsUnique();
            b.HasQueryFilter(x => CurrentTenantId == null || x.TenantId == CurrentTenantId);
        });

        modelBuilder.ApplyInteropModel();
    }
}
