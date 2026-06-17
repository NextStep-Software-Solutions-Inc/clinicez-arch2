using System.Linq.Expressions;
using CLINICEZ.Shared.Interfaces;
using Microsoft.EntityFrameworkCore;
using PatientApp.Domain.Common;
using PatientApp.Domain.Entities;

namespace PatientApp.Infrastructure.Persistence;

public sealed class ApplicationDbContext : DbContext
{
    private readonly ICurrentUserService? _currentUserService;

    public ApplicationDbContext(
        DbContextOptions<ApplicationDbContext> options,
        ICurrentUserService? currentUserService = null)
        : base(options)
    {
        _currentUserService = currentUserService;
    }

    // ── Patient identity & profile ──────────────────────────────────────────
    public DbSet<Patient> Patients => Set<Patient>();
    public DbSet<PatientGovernmentId> PatientGovernmentIds => Set<PatientGovernmentId>();
    public DbSet<PatientAddress> PatientAddresses => Set<PatientAddress>();
    public DbSet<EmergencyContact> EmergencyContacts => Set<EmergencyContact>();

    // ── Medical history (patient self-entry) ────────────────────────────────
    public DbSet<PatientAllergy> PatientAllergies => Set<PatientAllergy>();
    public DbSet<PatientMedication> PatientMedications => Set<PatientMedication>();
    public DbSet<PatientSurgicalHistory> PatientSurgicalHistories => Set<PatientSurgicalHistory>();
    public DbSet<PatientPastIllness> PatientPastIllnesses => Set<PatientPastIllness>();
    public DbSet<PatientChronicCondition> PatientChronicConditions => Set<PatientChronicCondition>();
    public DbSet<PatientFamilyHistory> PatientFamilyHistories => Set<PatientFamilyHistory>();

    // ── One-to-one profiles ─────────────────────────────────────────────────
    public DbSet<PatientSocialHistory> PatientSocialHistories => Set<PatientSocialHistory>();
    public DbSet<PatientObstetricProfile> PatientObstetricProfiles => Set<PatientObstetricProfile>();
    public DbSet<PatientMentalHealthProfile> PatientMentalHealthProfiles => Set<PatientMentalHealthProfile>();

    // ── Clinical records (HCW entry) ────────────────────────────────────────
    public DbSet<VitalSigns> VitalSigns => Set<VitalSigns>();
    public DbSet<Consultation> Consultations => Set<Consultation>();
    public DbSet<Prescription> Prescriptions => Set<Prescription>();
    public DbSet<LabResult> LabResults => Set<LabResult>();
    public DbSet<ImagingResult> ImagingResults => Set<ImagingResult>();

    // ── Files & Appointments ────────────────────────────────────────────────
    public DbSet<FileRecord> FileRecords => Set<FileRecord>();
    public DbSet<Appointment> Appointments => Set<Appointment>();

    // ── Infrastructure ──────────────────────────────────────────────────────
    public DbSet<SyncLog> SyncLogs => Set<SyncLog>();
    public DbSet<DeviceSession> DeviceSessions => Set<DeviceSession>();
    public DbSet<Notification> Notifications => Set<Notification>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);

        // Apply PostgreSQL xmin concurrency token and soft-delete filter
        // to every entity that inherits BaseEntity.
        foreach (var entityType in modelBuilder.Model.GetEntityTypes()
            .Where(t => typeof(BaseEntity).IsAssignableFrom(t.ClrType)))
        {
            // xmin — PostgreSQL system column used as optimistic concurrency row version.
            // No extra column is created; Npgsql reads the value directly from xmin.
            modelBuilder.Entity(entityType.ClrType, b =>
            {
                b.Property<uint>("xmin")
                    .HasColumnType("xid")
                    .ValueGeneratedOnAddOrUpdate()
                    .IsRowVersion();
            });

            // Global soft-delete query filter
            var param = Expression.Parameter(entityType.ClrType, "e");
            var filter = Expression.Lambda(
                Expression.Equal(
                    Expression.Property(param, nameof(BaseEntity.IsDeleted)),
                    Expression.Constant(false)),
                param);

            modelBuilder.Entity(entityType.ClrType).HasQueryFilter(filter);
        }

        base.OnModelCreating(modelBuilder);
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var utcNow = DateTime.UtcNow;
        var actor = _currentUserService?.UserId ?? "system";

        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    entry.Entity.CreatedAt = utcNow;
                    entry.Entity.CreatedBy = actor;
                    break;
                case EntityState.Modified:
                    entry.Entity.UpdatedAt = utcNow;
                    entry.Entity.UpdatedBy = actor;
                    break;
            }
        }

        return await base.SaveChangesAsync(cancellationToken);
    }
}

