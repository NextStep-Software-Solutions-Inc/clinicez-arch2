using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Workspace;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace ClinicEz.Pharmacy.Infrastructure.Persistence;

public class ApplicationDbContext(
    DbContextOptions<ApplicationDbContext> options,
    Microsoft.Extensions.Configuration.IConfiguration configuration,
    IPharmacyContext pharmacyContext) : DbContext(options), IInteropDbContext, IWorkspaceProfileDbContext
{
    public DbSet<Product> Products { get; set; }
    public DbSet<PharmacyInventoryItem> InventoryItems { get; set; }
    public DbSet<InventoryBatch> InventoryBatches { get; set; }
    public DbSet<PrescriptionOrder> PrescriptionOrders { get; set; }
    public DbSet<PrescriptionOrderItem> PrescriptionOrderItems { get; set; }
    public DbSet<DispenseAuditRecord> DispenseAuditRecords { get; set; }
    public DbSet<PharmacyStaffMember> PharmacyStaffMembers { get; set; }
    public DbSet<PharmacyRefreshToken> RefreshTokens { get; set; }
    public DbSet<PharmacySettings> PharmacySettings { get; set; }
    public DbSet<GamotBeneficiaryLedger> GamotBeneficiaryLedgers { get; set; }
    public DbSet<GamotLedgerTransaction> GamotLedgerTransactions { get; set; }
    public DbSet<InteropOutboxMessage> InteropOutbox => Set<InteropOutboxMessage>();
    public DbSet<InteropInboxMessage> InteropInbox => Set<InteropInboxMessage>();
    public DbSet<WorkspaceProfileRecord> WorkspaceProfiles => Set<WorkspaceProfileRecord>();

    // Read by the global query filters; EF re-evaluates them per DbContext instance, so every
    // request / message handler is scoped to its own tenant + pharmacy.
    private string CurrentTenantId => pharmacyContext.TenantId;
    private Guid CurrentPharmacyId => pharmacyContext.PharmacyId;
    private string CurrentPharmacyIdText => pharmacyContext.PharmacyId.ToString();

    // Every enum, nullable ones included, is stored as its C# name so the tables stay readable and ordinals can be reordered safely.
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(64);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var schemaName = configuration["DbSchema"] ?? "public";
        modelBuilder.HasDefaultSchema(schemaName);

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            var idProperty = entity.FindProperty("Id");
            if (idProperty == null) continue;

            if (entity.FindPrimaryKey() == null)
            {
                if (idProperty.ClrType == typeof(Guid))
                {
                    idProperty.SetDefaultValueSql("gen_random_uuid()");
                }
                entity.SetPrimaryKey(idProperty);
                idProperty.ValueGenerated = ValueGenerated.OnAdd;
            }
        }

        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Sku).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Price).HasPrecision(18, 2);
        });

        modelBuilder.Entity<PharmacyInventoryItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Sku).IsRequired().HasMaxLength(100);
            entity.Property(e => e.GenericName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.BrandName).HasMaxLength(255);
            entity.Property(e => e.DosageForm).HasMaxLength(100);
            entity.Property(e => e.Strength).HasMaxLength(100);
            entity.Property(e => e.UnitCost).HasPrecision(18, 2);
            entity.Property(e => e.UnitPrice).HasPrecision(18, 2);

            entity.HasMany(e => e.Batches)
                .WithOne(b => b.InventoryItem)
                .HasForeignKey(b => b.InventoryItemId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<InventoryBatch>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.BatchNumber).IsRequired().HasMaxLength(100);
        });

        modelBuilder.Entity<PrescriptionOrder>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PrescriptionNumber).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PharmacyId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.OrderingTenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.OrderingFacilityId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.BranchId).HasMaxLength(100);
            entity.HasIndex(e => e.BranchId);
            entity.HasIndex(e => new { e.TenantId, e.PharmacyId, e.OrderingTenantId, e.OrderingFacilityId, e.ExternalPrescriptionId }).IsUnique();
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.OrderingDoctorName).HasMaxLength(255);
            entity.Property(e => e.TotalAmount).HasPrecision(18, 2);
            entity.Property(e => e.PhilHealthIdentificationNumber).HasMaxLength(30);
            entity.Property(e => e.PhilHealthMemberPin).HasMaxLength(30);
            entity.Property(e => e.GamotCoverageAmount).HasPrecision(18, 2);
            entity.Property(e => e.PatientCoPayAmount).HasPrecision(18, 2);
            entity.Property(e => e.PharmacyName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.VisitKey).HasMaxLength(100);
            entity.Property(e => e.QuotedAmount).HasPrecision(18, 2);
            entity.Property(e => e.PaidAmount).HasPrecision(18, 2);
            entity.Property(e => e.PaymentReceiptNumber).HasMaxLength(100);
            entity.Property(e => e.PaymentReversedAmount).HasPrecision(18, 2);
            entity.Property(e => e.StatusReason).HasMaxLength(1000);

            entity.HasMany(e => e.Items)
                .WithOne(i => i.PrescriptionOrder)
                .HasForeignKey(i => i.PrescriptionOrderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(e => e.DispenseRecords)
                .WithOne(d => d.PrescriptionOrder)
                .HasForeignKey(d => d.PrescriptionOrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PrescriptionOrderItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.GenericName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Dosage).IsRequired().HasMaxLength(100);
            entity.Property(e => e.UnitPrice).HasPrecision(18, 2);
            entity.Property(e => e.Subtotal).HasPrecision(18, 2);
            entity.Property(e => e.PhilHealthDrugCode).HasMaxLength(50);
            entity.Property(e => e.UniquePrescriptionSecurityCode).HasMaxLength(100);
            entity.Property(e => e.GamotReferencePrice).HasPrecision(18, 2);
        });

        modelBuilder.Entity<DispenseAuditRecord>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PharmacistName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.PharmacistPrcLicense).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TotalAmount).HasPrecision(18, 2);
        });

        modelBuilder.Entity<GamotBeneficiaryLedger>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PharmacyId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.PhilHealthIdentificationNumber).IsRequired().HasMaxLength(30);
            entity.Property(e => e.MemberPhilHealthIdentificationNumber).HasMaxLength(30);
            entity.Property(e => e.BenefitYear).IsRequired().HasMaxLength(10);
            entity.Property(e => e.AnnualAllocation).HasPrecision(18, 2);
            entity.Property(e => e.TotalAmountUtilized).HasPrecision(18, 2);

            entity.HasMany(e => e.Transactions)
                .WithOne(t => t.Ledger)
                .HasForeignKey(t => t.GamotBeneficiaryLedgerId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.TenantId, e.PharmacyId, e.PhilHealthIdentificationNumber, e.BenefitYear });
        });

        modelBuilder.Entity<GamotLedgerTransaction>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PharmacyId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PrescriptionNumber).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PhilHealthDrugCode).IsRequired().HasMaxLength(50);
            entity.Property(e => e.GenericName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.BrandName).HasMaxLength(255);
            entity.Property(e => e.PhilHealthReferencePrice).HasPrecision(18, 2);
            entity.Property(e => e.TotalGamotAmount).HasPrecision(18, 2);
            entity.Property(e => e.PatientCoPay).HasPrecision(18, 2);
            entity.Property(e => e.UniquePrescriptionSecurityCode).IsRequired().HasMaxLength(100);
            entity.Property(e => e.DispensingPharmacistName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.DispensingPharmacistPrc).IsRequired().HasMaxLength(100);
            entity.Property(e => e.HciAccreditationNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PhilHealthClaimSequenceNumber).HasMaxLength(100);
            entity.Property(e => e.Notes).HasMaxLength(500);

            entity.HasIndex(e => new { e.TenantId, e.PharmacyId, e.UniquePrescriptionSecurityCode });
        });

        modelBuilder.Entity<PharmacyStaffMember>(entity =>
        {
            entity.Property(e => e.PasswordHash).HasMaxLength(500);
            entity.HasIndex(e => new { e.PharmacyId, e.Email });
        });

        modelBuilder.Entity<PharmacyRefreshToken>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TokenHash).IsRequired().HasMaxLength(128);
            entity.Property(e => e.DeviceLabel).HasMaxLength(150);
            entity.HasIndex(e => e.TokenHash).IsUnique();
            entity.HasIndex(e => e.FamilyId);
            entity.HasIndex(e => e.StaffMemberId);
            entity.HasOne(e => e.StaffMember).WithMany().HasForeignKey(e => e.StaffMemberId).OnDelete(DeleteBehavior.Cascade);
        });

        // Tenant + pharmacy + soft-delete scoping. There is deliberately no "no scope => everything" bypass:
        // HTTP requests are scoped by token claims, interop handlers enter an explicit scope from the envelope's
        // To party (IPharmacyScopeSetter), and pre-authentication paths call IgnoreQueryFilters() explicitly.
        modelBuilder.Entity<PrescriptionOrder>().HasQueryFilter(e => !e.IsDeleted && e.TenantId == CurrentTenantId && e.PharmacyId == CurrentPharmacyIdText);
        modelBuilder.Entity<PharmacyInventoryItem>().HasQueryFilter(e => !e.IsDeleted && e.TenantId == CurrentTenantId && e.PharmacyId == CurrentPharmacyIdText);
        modelBuilder.Entity<InventoryBatch>().HasQueryFilter(e => !e.IsDeleted && e.TenantId == CurrentTenantId && e.PharmacyId == CurrentPharmacyIdText);
        modelBuilder.Entity<GamotBeneficiaryLedger>().HasQueryFilter(e => !e.IsDeleted && e.TenantId == CurrentTenantId && e.PharmacyId == CurrentPharmacyIdText);
        modelBuilder.Entity<GamotLedgerTransaction>().HasQueryFilter(e => !e.IsDeleted && e.TenantId == CurrentTenantId && e.PharmacyId == CurrentPharmacyIdText);
        modelBuilder.Entity<PharmacySettings>().HasQueryFilter(e => !e.IsDeleted && e.TenantId == CurrentTenantId && e.PharmacyId == CurrentPharmacyId);
        modelBuilder.Entity<PharmacyStaffMember>().HasQueryFilter(e => !e.IsDeleted && e.TenantId == CurrentTenantId && e.PharmacyId == CurrentPharmacyId);
        modelBuilder.Entity<PharmacyRefreshToken>().HasQueryFilter(e => !e.IsDeleted && e.TenantId == CurrentTenantId && e.PharmacyId == CurrentPharmacyId);
        modelBuilder.Entity<PrescriptionOrderItem>().HasQueryFilter(e => !e.IsDeleted && e.PrescriptionOrder!.TenantId == CurrentTenantId && e.PrescriptionOrder!.PharmacyId == CurrentPharmacyIdText);
        modelBuilder.Entity<DispenseAuditRecord>().HasQueryFilter(e => !e.IsDeleted && e.PrescriptionOrder!.TenantId == CurrentTenantId && e.PrescriptionOrder!.PharmacyId == CurrentPharmacyIdText);
        modelBuilder.Entity<Product>().HasQueryFilter(e => !e.IsDeleted);

        modelBuilder.ApplyInteropModel();
        modelBuilder.ApplyWorkspaceProfileModel();

        base.OnModelCreating(modelBuilder);
    }
}
