using ClinicEz.Laboratory.Domain.Common;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Workspace;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace ClinicEz.Laboratory.Infrastructure.Persistence;

public class ApplicationDbContext(
    DbContextOptions<ApplicationDbContext> options,
    Microsoft.Extensions.Configuration.IConfiguration configuration,
    ClinicEz.Laboratory.Domain.Interfaces.ILabContext? labContext = null) : DbContext(options), IInteropDbContext, IWorkspaceProfileDbContext
{
    public DbSet<InteropOutboxMessage> InteropOutbox { get; set; }
    public DbSet<InteropInboxMessage> InteropInbox { get; set; }
    public DbSet<Product> Products { get; set; }
    public DbSet<LabRequisition> LabRequisitions { get; set; }
    public DbSet<Specimen> Specimens { get; set; }
    public DbSet<AnalyteResult> AnalyteResults { get; set; }
    public DbSet<DiagnosticReport> DiagnosticReports { get; set; }
    public DbSet<QcLot> QcLots { get; set; }
    public DbSet<QcRun> QcRuns { get; set; }
    public DbSet<CriticalPanicDispatchLog> CriticalPanicDispatchLogs { get; set; }
    public DbSet<LabStaffMember> LabStaffMembers { get; set; }
    public DbSet<LabRefreshToken> LabRefreshTokens { get; set; }
    public DbSet<LabSettings> LabSettings { get; set; }
    public DbSet<WorkspaceProfileRecord> WorkspaceProfiles => Set<WorkspaceProfileRecord>();

    /// <summary>
    /// True only for the explicit <see cref="LabScopeKind.System"/> scope of named administrative jobs. A context built
    /// without an <see cref="ILabContext"/> (design-time tooling and unit tests; the host always registers one) is unscoped.
    /// </summary>
    private bool UnrestrictedScope => labContext is null || labContext.ScopeKind == LabScopeKind.System;

    /// <summary>Tenant of the active facility scope; empty (matches no row) when there is none.</summary>
    private string ScopeTenantId => labContext?.TenantId ?? string.Empty;

    /// <summary>Laboratory of the active facility scope; empty (matches no row) when there is none.</summary>
    private Guid ScopeLaboratoryId => labContext?.LaboratoryId ?? Guid.Empty;

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        EnforceFacilityScopeOnWrites();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        EnforceFacilityScopeOnWrites();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    /// <summary>
    /// Inside a facility scope a new laboratory-owned row is stamped with that tenant and laboratory when it carries none,
    /// and any laboratory-owned row that belongs to a different tenant or laboratory is refused, so a scoped caller can
    /// never write across facilities.
    /// </summary>
    private void EnforceFacilityScopeOnWrites()
    {
        if (labContext is not { ScopeKind: LabScopeKind.Facility })
        {
            return;
        }

        var tenantId = labContext.TenantId ?? string.Empty;
        var laboratoryId = labContext.LaboratoryId ?? Guid.Empty;

        foreach (var entry in ChangeTracker.Entries<ILabScopedEntity>())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified))
            {
                continue;
            }

            var entity = entry.Entity;
            if (entry.State == EntityState.Added)
            {
                if (string.IsNullOrEmpty(entity.TenantId)) entity.TenantId = tenantId;
                if (entity.LaboratoryId == Guid.Empty) entity.LaboratoryId = laboratoryId;
            }

            if (!string.Equals(entity.TenantId, tenantId, StringComparison.Ordinal) || entity.LaboratoryId != laboratoryId)
            {
                throw new InvalidOperationException(
                    $"Refusing to save a {entry.Metadata.ClrType.Name} of tenant '{entity.TenantId}' / laboratory '{entity.LaboratoryId}' from the scope of tenant '{tenantId}' / laboratory '{laboratoryId}'.");
            }
        }
    }

    /// <summary>Every enum is persisted as its C# name (nullable enums included), never as a number.</summary>
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(64);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var schemaName = configuration["DbSchema"];
        if (string.IsNullOrEmpty(schemaName))
        {
            throw new InvalidOperationException("DbSchema configuration value is required but was not specified.");
        }
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
            entity.Property(e => e.TenantId).HasMaxLength(100);
            entity.Property(e => e.Price).HasPrecision(18, 2);
        });

        modelBuilder.Entity<LabRequisition>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.AccessionNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.BranchId).HasMaxLength(100);
            entity.Property(e => e.VisitKey).HasMaxLength(100);
            entity.Property(e => e.StageReason).HasMaxLength(500);
            entity.Property(e => e.Currency).IsRequired().HasMaxLength(3);
            entity.Property(e => e.ReceiptNumber).HasMaxLength(100);
            entity.Property(e => e.QuotedAmount).HasPrecision(18, 2);
            entity.Property(e => e.RefundedAmount).HasPrecision(18, 2);
            entity.HasIndex(e => e.InvoiceId);
            entity.Property(e => e.OrderingTenantId).HasMaxLength(100);
            entity.Property(e => e.OrderingFacilityId).HasMaxLength(100);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(255);
            entity.HasIndex(e => new { e.LaboratoryId, e.AccessionNumber }).IsUnique();
            entity.HasIndex(e => e.ExternalRequisitionId);
            entity.HasIndex(e => new { e.LaboratoryId, e.OrderingTenantId, e.OrderingFacilityId, e.ExternalRequisitionId }).IsUnique();
            entity.HasIndex(e => e.BranchId);
            entity.HasMany(e => e.Specimens).WithOne().HasForeignKey(s => s.LabRequisitionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.AnalyteResults).WithOne().HasForeignKey(r => r.LabRequisitionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.DiagnosticReport).WithOne().HasForeignKey<DiagnosticReport>(d => d.LabRequisitionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Specimen>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Barcode).IsRequired().HasMaxLength(50);
            entity.HasIndex(e => new { e.LabRequisitionId, e.Barcode }).IsUnique();
            entity.Property(e => e.RackId).HasMaxLength(50);
            entity.Property(e => e.RackPosition).HasMaxLength(20);
        });

        modelBuilder.Entity<AnalyteResult>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PanelName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.AnalyteCode).IsRequired().HasMaxLength(50);
            entity.Property(e => e.AnalyteName).IsRequired().HasMaxLength(100);
        });

        modelBuilder.Entity<DiagnosticReport>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ReportNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PathologistName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.PathologistPrcLicense).IsRequired().HasMaxLength(50);
        });

        modelBuilder.Entity<QcLot>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.LotNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.ControlName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.AnalyteCode).IsRequired().HasMaxLength(50);
            entity.Property(e => e.InstrumentName).HasMaxLength(100);
            entity.HasMany(e => e.Runs).WithOne().HasForeignKey(r => r.QcLotId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<QcRun>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.AnalyteCode).IsRequired().HasMaxLength(50);
            entity.Property(e => e.RunByMedTechName).HasMaxLength(100);
            entity.Property(e => e.ViolationRules).HasMaxLength(255);
        });

        modelBuilder.Entity<CriticalPanicDispatchLog>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.AccessionNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.DispatchedByMedTechName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.NotifiedDoctorName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.CriticalFindings).IsRequired().HasMaxLength(1000);
        });

        modelBuilder.Entity<LabStaffMember>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PasswordHash).HasMaxLength(500);
            entity.HasIndex(e => new { e.LaboratoryId, e.Email });
        });

        modelBuilder.Entity<LabRefreshToken>(entity =>
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

        // Data isolation (plan 4.9): every row is filtered by tenant AND laboratory. The scope comes from the staff token, the
        // internal-service headers or, for message handlers, the envelope's To address. Anonymous requests and code that
        // never entered a scope match nothing. The only unrestricted scope is the explicit, named System scope.
        modelBuilder.Entity<Product>().HasQueryFilter(e => UnrestrictedScope || (e.TenantId == ScopeTenantId && e.LaboratoryId == ScopeLaboratoryId));
        modelBuilder.Entity<LabRequisition>().HasQueryFilter(e => UnrestrictedScope || (e.TenantId == ScopeTenantId && e.LaboratoryId == ScopeLaboratoryId));
        modelBuilder.Entity<QcLot>().HasQueryFilter(e => UnrestrictedScope || (e.TenantId == ScopeTenantId && e.LaboratoryId == ScopeLaboratoryId));
        modelBuilder.Entity<QcRun>().HasQueryFilter(e => UnrestrictedScope || (e.TenantId == ScopeTenantId && e.LaboratoryId == ScopeLaboratoryId));
        modelBuilder.Entity<CriticalPanicDispatchLog>().HasQueryFilter(e => UnrestrictedScope || (e.TenantId == ScopeTenantId && e.LaboratoryId == ScopeLaboratoryId));
        modelBuilder.Entity<LabStaffMember>().HasQueryFilter(e => UnrestrictedScope || (e.TenantId == ScopeTenantId && e.LaboratoryId == ScopeLaboratoryId));
        modelBuilder.Entity<LabRefreshToken>().HasQueryFilter(e => UnrestrictedScope || (e.TenantId == ScopeTenantId && e.LaboratoryId == ScopeLaboratoryId));
        modelBuilder.Entity<LabSettings>().HasQueryFilter(e => UnrestrictedScope || (e.TenantId == ScopeTenantId && e.LaboratoryId == ScopeLaboratoryId));

        modelBuilder.ApplyInteropModel();
        modelBuilder.ApplyWorkspaceProfileModel();

        base.OnModelCreating(modelBuilder);
    }
}







