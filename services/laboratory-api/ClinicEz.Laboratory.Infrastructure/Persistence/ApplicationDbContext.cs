using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace ClinicEz.Laboratory.Infrastructure.Persistence;

public class ApplicationDbContext(
    DbContextOptions<ApplicationDbContext> options,
    Microsoft.Extensions.Configuration.IConfiguration configuration,
    ClinicEz.Laboratory.Domain.Interfaces.ILabContext? labContext = null) : DbContext(options), IInteropDbContext
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

    /// <summary>
    /// Tenant of the authenticated staff session (from validated token claims). <c>null</c> for system scope
    /// (consumers, Hangfire, seeders, tests) and anonymous public endpoints, which disables the tenant filter.
    /// </summary>
    private string? CurrentTenantId => labContext?.TenantId;

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
            entity.Property(e => e.Price).HasPrecision(18, 2);
        });

        modelBuilder.Entity<LabRequisition>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.AccessionNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.BranchId).HasMaxLength(100);
            entity.Property(e => e.OrderingTenantId).HasMaxLength(100);
            entity.Property(e => e.OrderingFacilityId).HasMaxLength(100);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(255);
            entity.HasIndex(e => e.AccessionNumber).IsUnique();
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
            entity.HasIndex(e => e.Barcode).IsUnique();
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

        // Tenant isolation: authenticated staff only ever see rows of the tenant in their token. System scope
        // (no HTTP principal: consumers, Hangfire, seeders) and anonymous public endpoints are not restricted.
        modelBuilder.Entity<LabRequisition>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<QcLot>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<QcRun>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<CriticalPanicDispatchLog>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<LabStaffMember>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<LabRefreshToken>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);
        modelBuilder.Entity<LabSettings>().HasQueryFilter(e => CurrentTenantId == null || e.TenantId == CurrentTenantId);

        modelBuilder.ApplyInteropModel();

        base.OnModelCreating(modelBuilder);
    }
}







