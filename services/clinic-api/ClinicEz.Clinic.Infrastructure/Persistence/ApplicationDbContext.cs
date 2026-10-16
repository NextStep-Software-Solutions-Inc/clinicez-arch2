using System;
using System.Collections.Generic;
using System.Text.Json;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Workspace;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

public class ApplicationDbContext : DbContext, IInteropDbContext, IWorkspaceProfileDbContext
{
    private readonly IConfiguration _configuration;
    private readonly IClinicContext? _clinicContext;

    public ApplicationDbContext(
        DbContextOptions<ApplicationDbContext> options,
        IConfiguration configuration,
        IClinicContext? clinicContext = null) : base(options)
    {
        _configuration = configuration;
        _clinicContext = clinicContext;
    }

    public DbSet<Product> Products { get; set; } = null!;
    public DbSet<ClinicRole> ClinicRoles { get; set; } = null!;
    public DbSet<ClinicRoom> ClinicRooms { get; set; } = null!;
    public DbSet<StaffMember> StaffMembers { get; set; } = null!;
    public DbSet<ClinicRefreshToken> RefreshTokens { get; set; } = null!;
    public DbSet<Appointment> Appointments { get; set; } = null!;
    public DbSet<QueueItem> QueueItems { get; set; } = null!;
    public DbSet<TriageVitals> TriageVitals { get; set; } = null!;
    public DbSet<ConsultationEncounter> Consultations { get; set; } = null!;
    public DbSet<EncounterDiagnosis> Diagnoses { get; set; } = null!;
    public DbSet<PrescriptionItem> Prescriptions { get; set; } = null!;
    public DbSet<ClinicServiceItem> ServiceItems { get; set; } = null!;
    public DbSet<Invoice> Invoices { get; set; } = null!;
    public DbSet<InvoiceLineItem> InvoiceLineItems { get; set; } = null!;
    public DbSet<PaymentRecord> Payments { get; set; } = null!;
    public DbSet<ClinicalProcedure> Procedures { get; set; } = null!;
    public DbSet<ClinicLabOrder> LabOrders { get; set; } = null!;
    public DbSet<ClinicLabOrderItem> LabOrderItems { get; set; } = null!;
    public DbSet<ClinicPatient> Patients { get; set; } = null!;
    public DbSet<MedicalCertificate> MedicalCertificates { get; set; } = null!;
    public DbSet<ReferralLetter> ReferralLetters { get; set; } = null!;
    public DbSet<ClinicRecordAttachment> RecordAttachments { get; set; } = null!;
    public DbSet<ClinicCustomFieldDefinition> CustomFieldDefinitions { get; set; } = null!;
    public DbSet<ClinicSettings> ClinicSettings { get; set; } = null!;
    public DbSet<EodReconciliationAudit> EodReconciliationAudits { get; set; } = null!;
    public DbSet<YakapTransmittal> YakapTransmittals { get; set; } = null!;
    public DbSet<YakapTransmittalItem> YakapTransmittalItems { get; set; } = null!;
    public DbSet<PhilHealthSequenceTracker> PhilHealthSequenceTrackers { get; set; } = null!;
    public DbSet<PatientCodeSequenceTracker> PatientCodeSequenceTrackers { get; set; } = null!;
    public DbSet<PhilHealthCatalogItem> PhilHealthCatalogItems { get; set; } = null!;
    public DbSet<PhilHealthCatalogImportLog> PhilHealthCatalogImportLogs { get; set; } = null!;
    public DbSet<IdempotencyRecord> IdempotencyRecords { get; set; } = null!;
    public DbSet<ClinicLabResult> LabResults { get; set; } = null!;
    public DbSet<UploadGrant> UploadGrants { get; set; } = null!;
    public DbSet<ShareImport> ShareImports { get; set; } = null!;
    public DbSet<InteropOutboxMessage> InteropOutbox { get; set; } = null!;
    public DbSet<InteropInboxMessage> InteropInbox { get; set; } = null!;
    public DbSet<DoctorScheduleTemplate> DoctorScheduleTemplates { get; set; } = null!;
    public DbSet<DoctorBreakTime> DoctorBreakTimes { get; set; } = null!;
    public DbSet<DoctorLeave> DoctorLeaves { get; set; } = null!;
    public DbSet<DoctorScheduleOverride> DoctorScheduleOverrides { get; set; } = null!;
    public DbSet<PatientSurgicalHistory> PatientSurgicalHistories { get; set; } = null!;
    public DbSet<PatientSocialHistory> PatientSocialHistories { get; set; } = null!;
    public DbSet<PatientReproductiveHistory> PatientReproductiveHistories { get; set; } = null!;
    public DbSet<NcdRiskAssessment> NcdRiskAssessments { get; set; } = null!;
    public DbSet<PatientImmunization> PatientImmunizations { get; set; } = null!;
    public DbSet<PatientProblem> PatientProblems { get; set; } = null!;
    public DbSet<PatientAllergy> PatientAllergies { get; set; } = null!;
    public DbSet<PatientPastMedicalHistory> PatientPastMedicalHistories { get; set; } = null!;
    public DbSet<PatientFamilyHistory> PatientFamilyHistories { get; set; } = null!;
    public DbSet<PatientPhysicalExamProfile> PatientPhysicalExamProfiles { get; set; } = null!;
    public DbSet<ClinicStaffNotification> StaffNotifications { get; set; } = null!;
    public DbSet<WorkspaceProfileRecord> WorkspaceProfiles => Set<WorkspaceProfileRecord>();

    public Guid CurrentClinicId => _clinicContext?.ClinicId ?? Guid.Empty;

    /// <summary>Every enum is persisted as its C# name (nullable enums included), never as a number.</summary>
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(50);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var schemaName = _configuration["DbSchema"] ?? "clinic_dashboard";
        modelBuilder.HasDefaultSchema(schemaName);
        modelBuilder.HasPostgresExtension("btree_gist");

        // Auto Primary Keys & Defaults
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

        // 1. Multi-Tenant & Clinic Jurisdiction Global Query Filters
        modelBuilder.Entity<ClinicRole>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ClinicRoom>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<StaffMember>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<Appointment>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<DoctorScheduleTemplate>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<DoctorBreakTime>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<DoctorLeave>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<DoctorScheduleOverride>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<QueueItem>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<TriageVitals>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ConsultationEncounter>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ClinicServiceItem>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<Invoice>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ClinicalProcedure>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ClinicLabOrder>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ClinicPatient>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<MedicalCertificate>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ReferralLetter>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ClinicRecordAttachment>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ClinicCustomFieldDefinition>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ClinicSettings>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<EodReconciliationAudit>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<YakapTransmittal>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<YakapTransmittalItem>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ClinicLabResult>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<UploadGrant>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ShareImport>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientSurgicalHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientSocialHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientReproductiveHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<NcdRiskAssessment>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientImmunization>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientProblem>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientAllergy>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientPastMedicalHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientFamilyHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientPhysicalExamProfile>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ClinicStaffNotification>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);

        modelBuilder.Entity<ClinicStaffNotification>(b =>
        {
            b.ToTable("clinic_staff_notifications");
            b.HasIndex(n => new { n.ClinicId, n.IsRead, n.CreatedAt });
            b.HasIndex(n => n.RecipientStaffId);
        });

        modelBuilder.Entity<EncounterDiagnosis>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<PrescriptionItem>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Product>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<ClinicRefreshToken>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);

        // 2. Entity Configurations
        var permissionsConverter = new ValueConverter<List<string>, string>(
            v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
            v => string.IsNullOrEmpty(v) ? new List<string>() : JsonSerializer.Deserialize<List<string>>(v, (JsonSerializerOptions?)null) ?? new List<string>()
        );

        var stringListComparer = new ValueComparer<List<string>>(
            (c1, c2) => c1 != null && c2 != null ? c1.SequenceEqual(c2) : c1 == c2,
            c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.GetHashCode())),
            c => c.ToList());

        var customFieldsConverter = new ValueConverter<Dictionary<string, object?>, string>(
            v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
            v => string.IsNullOrEmpty(v) ? new Dictionary<string, object?>() : JsonSerializer.Deserialize<Dictionary<string, object?>>(v, (JsonSerializerOptions?)null) ?? new Dictionary<string, object?>()
        );

        var customFieldsComparer = new ValueComparer<Dictionary<string, object?>>(
            (d1, d2) => d1 != null && d2 != null ? d1.Count == d2.Count && !d1.Except(d2).Any() : d1 == d2,
            d => d == null ? 0 : d.Aggregate(0, (a, p) => HashCode.Combine(a, p.Key.GetHashCode(), p.Value != null ? p.Value.GetHashCode() : 0)),
            d => d == null ? new Dictionary<string, object?>() : new Dictionary<string, object?>(d));

        modelBuilder.Entity<ClinicRole>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Description).HasMaxLength(255);
            entity.Property(e => e.Permissions).HasConversion(permissionsConverter, stringListComparer);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
        });

        modelBuilder.Entity<ClinicRoom>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Code).HasMaxLength(30);
            entity.Property(e => e.Description).HasMaxLength(255);
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.DisplayOrder });
            entity.HasIndex(e => new { e.ClinicId, e.Name });
        });

        modelBuilder.Entity<StaffMember>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.FirstName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.LastName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Email).HasMaxLength(255);
            entity.Property(e => e.PhoneNumber).HasMaxLength(50);
            entity.Property(e => e.PrcLicenseNumber).HasMaxLength(50);
            entity.Property(e => e.PtrNumber).HasMaxLength(50);
            entity.Property(e => e.S2LicenseNumber).HasMaxLength(50);
            entity.Property(e => e.Specialty).HasMaxLength(100);
            entity.Property(e => e.PhilHealthPan).HasMaxLength(50);

            entity.HasOne(e => e.ClinicRole)
                .WithMany(r => r.StaffMembers)
                .HasForeignKey(e => e.ClinicRoleId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.Property(e => e.AssignedRoomIdsJson).HasColumnType("text");

            entity.Property(e => e.PasswordHash).HasMaxLength(500);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.Email });
        });

        modelBuilder.Entity<ClinicRefreshToken>(entity =>
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

        modelBuilder.Entity<Appointment>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).HasMaxLength(100);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.ServiceType).HasMaxLength(255);
            entity.Property(e => e.Reason).HasMaxLength(255);
            entity.Property(e => e.EndTimeUtc).IsRequired();
            entity.Property(e => e.Version).IsRowVersion();
            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => e.ScheduledAt);
            entity.HasIndex(e => new { e.ClinicId, e.DoctorId, e.ScheduledAt, e.EndTimeUtc });
        });

        modelBuilder.Entity<DoctorScheduleTemplate>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.DoctorName).IsRequired().HasMaxLength(150);
            entity.HasIndex(e => new { e.ClinicId, e.DoctorId, e.DayOfWeek, e.IsActive });
            entity.HasMany(e => e.BreakTimes)
                .WithOne(b => b.Template)
                .HasForeignKey(b => b.TemplateId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DoctorBreakTime>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Description).IsRequired().HasMaxLength(150);
            entity.HasIndex(e => e.TemplateId);
        });

        modelBuilder.Entity<DoctorLeave>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.DoctorName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Reason).HasMaxLength(500);
            entity.Property(e => e.Status).HasMaxLength(50);
            entity.Property(e => e.LeaveType).HasMaxLength(50);
            entity.HasIndex(e => new { e.ClinicId, e.DoctorId, e.StartDate, e.EndDate });
        });

        modelBuilder.Entity<DoctorScheduleOverride>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.DoctorName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Reason).HasMaxLength(500);
            entity.HasIndex(e => new { e.ClinicId, e.DoctorId, e.Date });
        });

        modelBuilder.Entity<QueueItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.QueueNumber).IsRequired().HasMaxLength(20);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.DoctorName).HasMaxLength(150);
            entity.Property(e => e.ChiefComplaint).HasMaxLength(255);
            entity.Property(e => e.RoomOrStation).HasMaxLength(100);
            entity.Property(e => e.ApproachingNotificationSent).HasDefaultValue(false);
            entity.Property(e => e.CalledNotificationSent).HasDefaultValue(false);

            entity.HasOne(e => e.Appointment)
                .WithMany()
                .HasForeignKey(e => e.AppointmentId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.Room)
                .WithMany(r => r.QueueItems)
                .HasForeignKey(e => e.RoomId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.TriageVitals)
                .WithOne(v => v.QueueItem)
                .HasForeignKey<TriageVitals>(v => v.QueueItemId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Consultation)
                .WithOne(c => c.QueueItem)
                .HasForeignKey<ConsultationEncounter>(c => c.QueueItemId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.QueueDate });
        });

        modelBuilder.Entity<TriageVitals>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TemperatureCelsius).HasPrecision(5, 2);
            entity.Property(e => e.OxygenSaturationPercent).HasPrecision(5, 2);
            entity.Property(e => e.HeightCm).HasPrecision(6, 2);
            entity.Property(e => e.WeightKg).HasPrecision(6, 2);
            entity.Property(e => e.Bmi).HasPrecision(5, 2);
            entity.Property(e => e.RecordedByNurseName).HasMaxLength(150);
            entity.Property(e => e.VisualAcuityLeft).HasMaxLength(50);
            entity.Property(e => e.VisualAcuityRight).HasMaxLength(50);
            entity.Property(e => e.HeadCircumferenceCm).HasPrecision(6, 2);
            entity.Property(e => e.MidUpperArmCircumferenceCm).HasPrecision(6, 2);
            entity.Property(e => e.ZScoreWeightForAge).HasPrecision(5, 2);
            entity.Property(e => e.ZScoreLengthForAge).HasPrecision(5, 2);
            entity.Property(e => e.ZScoreWeightForLength).HasPrecision(5, 2);
            entity.Property(e => e.PhilHealthZScoreCategory).HasMaxLength(50);
            entity.Property(e => e.PhilHealthZScoreCode).HasMaxLength(50);
        });

        modelBuilder.Entity<ConsultationEncounter>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.DoctorName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.DoctorPrcLicense).HasMaxLength(50);
            entity.Property(e => e.DoctorPtr).HasMaxLength(50);
            entity.Property(e => e.DoctorS2License).HasMaxLength(50);
            entity.Property(e => e.DoctorPhilHealthPan).HasMaxLength(50);
            entity.Property(e => e.PhilHealthAtc).HasMaxLength(50);
            entity.Property(e => e.HciCaseNo).HasMaxLength(50);
            entity.Property(e => e.HciTransNo).HasMaxLength(50);
            entity.Property(e => e.SoapTransNo).HasMaxLength(50);
            entity.Property(e => e.GeneralSurveyId).HasMaxLength(50);
            entity.Property(e => e.RxClaimToken).HasMaxLength(200);

            entity.HasMany(e => e.Diagnoses)
                .WithOne(d => d.ConsultationEncounter)
                .HasForeignKey(d => d.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(e => e.Prescriptions)
                .WithOne(p => p.ConsultationEncounter)
                .HasForeignKey(p => p.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.TenantId, e.BranchId });
        });

        modelBuilder.Entity<EncounterDiagnosis>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Icd10Code).IsRequired().HasMaxLength(20);
            entity.Property(e => e.Description).IsRequired().HasMaxLength(255);
        });

        modelBuilder.Entity<PrescriptionItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.GenericName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.BrandName).HasMaxLength(150);
            entity.Property(e => e.Dosage).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Form).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Sig).IsRequired().HasMaxLength(255);
        });

        modelBuilder.Entity<ClinicServiceItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Code).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Category).IsRequired().HasMaxLength(50);
            entity.Property(e => e.StandardPrice).HasPrecision(18, 2);
            entity.Property(e => e.PhilHealthCode).HasMaxLength(50);
            entity.Property(e => e.PhilHealthDescription).HasMaxLength(255);
            entity.Property(e => e.IsPhilHealthFormulary).HasDefaultValue(false);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.Code }).IsUnique();
        });

        modelBuilder.Entity<Invoice>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.InvoiceNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.GrossAmount).HasPrecision(18, 2);
            entity.Property(e => e.DiscountPercentage).HasPrecision(5, 2);
            entity.Property(e => e.DiscountAmount).HasPrecision(18, 2);
            entity.Property(e => e.NetAmount).HasPrecision(18, 2);
            entity.Property(e => e.AmountPaid).HasPrecision(18, 2);
            entity.Property(e => e.RefundedAmount).HasPrecision(18, 2);
            entity.Property(e => e.BalanceDue).HasPrecision(18, 2);

            entity.HasMany(e => e.LineItems)
                .WithOne()
                .HasForeignKey(l => l.InvoiceId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(e => e.Payments)
                .WithOne()
                .HasForeignKey(p => p.InvoiceId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.InvoiceNumber }).IsUnique();
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.InvoiceDate });
        });

        modelBuilder.Entity<InvoiceLineItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Description).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Category).IsRequired().HasMaxLength(50);
            entity.Property(e => e.UnitPrice).HasPrecision(18, 2);
            entity.Property(e => e.TotalPrice).HasPrecision(18, 2);
        });

        modelBuilder.Entity<PaymentRecord>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PaymentNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Amount).HasPrecision(18, 2);
            entity.Property(e => e.ReferenceNumber).HasMaxLength(100);
        });

        modelBuilder.Entity<ClinicalProcedure>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.ProcedureName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Category).IsRequired().HasMaxLength(50);
            entity.Property(e => e.TargetRoomName).HasMaxLength(100);
            entity.HasOne(e => e.TargetRoom)
                .WithMany()
                .HasForeignKey(e => e.TargetRoomId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
        });

        modelBuilder.Entity<ClinicLabOrder>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.OrderNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.StageReason).HasMaxLength(500);
            entity.Property(e => e.QuotedAmount).HasPrecision(18, 2);
            entity.Property(e => e.QuotedCurrency).HasMaxLength(10);
            entity.Property(e => e.TargetTenantId).HasMaxLength(100);
            entity.Property(e => e.LaboratoryTenantId).HasMaxLength(100);
            entity.Property(e => e.LaboratoryFacilityId).HasMaxLength(100);
            entity.Property(e => e.LaboratoryName).HasMaxLength(200);
            entity.Property(e => e.ClaimToken).HasMaxLength(200);

            entity.HasMany(e => e.Items)
                .WithOne()
                .HasForeignKey(i => i.LabOrderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.OrderNumber }).IsUnique();
        });

        modelBuilder.Entity<ClinicLabOrderItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TestName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Category).IsRequired().HasMaxLength(50);
        });

        modelBuilder.Entity<ClinicLabResult>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ExternalLabName).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.FileName).HasMaxLength(255);
            entity.Property(e => e.ContentType).HasMaxLength(100);
            entity.Property(e => e.StorageKey).HasMaxLength(400);
            entity.Property(e => e.EncryptionIvBase64).HasMaxLength(100);
            entity.Property(e => e.EncryptionTagBase64).HasMaxLength(100);
            entity.Property(e => e.EncryptedHash).HasMaxLength(100);
            entity.Property(e => e.WrappedKeyJson).HasColumnType("text");
            entity.Property(e => e.VerifiedByName).HasMaxLength(150);
            entity.Property(e => e.VerifiedByPrc).HasMaxLength(50);
            entity.Property(e => e.ReviewRemarks).HasMaxLength(1000);
            entity.HasOne<ClinicLabOrder>()
                .WithMany()
                .HasForeignKey(e => e.LabOrderId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(e => new { e.ClinicId, e.LabOrderId });
            entity.HasIndex(e => new { e.ClinicId, e.Verification, e.SubmittedAt });
            entity.HasIndex(e => new { e.ClinicId, e.LabOrderId, e.ReportId })
                .IsUnique()
                .HasFilter("\"ReportId\" IS NOT NULL");
        });

        modelBuilder.Entity<UploadGrant>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TokenHash).IsRequired().HasMaxLength(32);
            entity.HasOne<ClinicLabOrder>()
                .WithMany()
                .HasForeignKey(e => e.LabOrderId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(e => e.TokenHash).IsUnique();
            entity.HasIndex(e => new { e.ClinicId, e.LabOrderId });
        });

        modelBuilder.Entity<ShareImport>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Purpose).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ChiefComplaint).HasMaxLength(255);
            entity.Property(e => e.DenialReason).HasMaxLength(500);
            entity.Property(e => e.PatientName).HasMaxLength(200);
            entity.Property(e => e.ClinicEzId).HasMaxLength(40);
            entity.Property(e => e.QueueNumber).HasMaxLength(20);
            entity.Property(e => e.ItemsJson).HasColumnType("text");
            // A flags enum is stored as its comma-separated names, which outgrow the 50-character default.
            entity.Property(e => e.Scopes).HasMaxLength(200);
            entity.HasIndex(e => new { e.ClinicId, e.RequestedAt });
        });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Sku).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Price).HasPrecision(18, 2);
        });

        modelBuilder.Entity<ClinicPatient>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientCode).IsRequired().HasMaxLength(30);
            entity.Property(e => e.ShareGrantScopes).HasMaxLength(200);
            entity.Property(e => e.FirstName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.LastName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ContactNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Gender).HasMaxLength(50);
            entity.Property(e => e.PhilHealthNumber).HasMaxLength(30);
            entity.Property(e => e.SeniorCitizenId).HasMaxLength(50);
            entity.Property(e => e.PwdId).HasMaxLength(50);
            entity.Property(e => e.VerificationStatus).HasMaxLength(50).HasDefaultValue("Verified");
            entity.Property(e => e.CustomFields)
                .HasConversion(customFieldsConverter, customFieldsComparer);
            entity.Property(e => e.ClinicEzId).HasMaxLength(40);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientCode }).IsUnique();
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.LastName, e.FirstName });
            entity.HasIndex(e => new { e.ClinicId, e.ClinicEzId });
            entity.HasIndex(e => new { e.ClinicId, e.SyncPatientId });
        });

        modelBuilder.Entity<PatientCodeSequenceTracker>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Year).IsRequired();
            entity.Property(e => e.CurrentSequence).IsRequired().IsConcurrencyToken();
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.Year }).IsUnique();
        });

        modelBuilder.Entity<PatientSurgicalHistory>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ProcedureName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.HospitalName).HasMaxLength(255);
            entity.Property(e => e.Findings).HasMaxLength(1000);
            entity.Property(e => e.Complications).HasMaxLength(1000);
            entity.Property(e => e.Remarks).HasMaxLength(1000);
            entity.HasOne(e => e.Patient)
                .WithMany(p => p.SurgicalHistories)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.PatientId, e.SurgeryDate });
        });

        modelBuilder.Entity<PatientSocialHistory>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PacksPerDay).HasPrecision(5, 2);
            entity.Property(e => e.SmokingPackYears).HasPrecision(5, 2);
            entity.Property(e => e.AlcoholFrequency).HasMaxLength(50);
            entity.Property(e => e.SubstanceUseHistory).HasMaxLength(500);
            entity.Property(e => e.DrugTypes).HasMaxLength(255);
            entity.Property(e => e.PhysicalActivityFrequency).HasMaxLength(100);
            entity.Property(e => e.DietaryHabits).HasMaxLength(255);
            entity.Property(e => e.Remarks).HasMaxLength(1000);
            entity.HasOne(e => e.Patient)
                .WithOne(p => p.SocialHistory)
                .HasForeignKey<PatientSocialHistory>(e => e.PatientId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId }).IsUnique();
        });

        modelBuilder.Entity<PatientReproductiveHistory>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ContraceptiveMethod).HasMaxLength(100);
            entity.Property(e => e.DeliveryType).HasMaxLength(50);
            entity.Property(e => e.Remarks).HasMaxLength(1000);
            entity.HasOne(e => e.Patient)
                .WithOne(p => p.ReproductiveHistory)
                .HasForeignKey<PatientReproductiveHistory>(e => e.PatientId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId }).IsUnique();
        });

        modelBuilder.Entity<PatientPhysicalExamProfile>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.GenSurveyId).HasMaxLength(10).HasDefaultValue("1");
            entity.Property(e => e.GenSurveyRemarks).HasMaxLength(1000);
            entity.Property(e => e.SkinId).HasMaxLength(10).HasDefaultValue("1");
            entity.Property(e => e.SkinRemarks).HasMaxLength(1000);
            entity.Property(e => e.HeentId).HasMaxLength(10).HasDefaultValue("11");
            entity.Property(e => e.HeentRemarks).HasMaxLength(1000);
            entity.Property(e => e.ChestId).HasMaxLength(10).HasDefaultValue("6");
            entity.Property(e => e.ChestRemarks).HasMaxLength(1000);
            entity.Property(e => e.HeartId).HasMaxLength(10).HasDefaultValue("5");
            entity.Property(e => e.HeartRemarks).HasMaxLength(1000);
            entity.Property(e => e.AbdomenId).HasMaxLength(10).HasDefaultValue("7");
            entity.Property(e => e.AbdomenRemarks).HasMaxLength(1000);
            entity.Property(e => e.NeuroId).HasMaxLength(10).HasDefaultValue("6");
            entity.Property(e => e.NeuroRemarks).HasMaxLength(1000);
            entity.Property(e => e.RectalId).HasMaxLength(10).HasDefaultValue("1");
            entity.Property(e => e.RectalRemarks).HasMaxLength(1000);
            entity.Property(e => e.GuId).HasMaxLength(10).HasDefaultValue("1");
            entity.Property(e => e.GuRemarks).HasMaxLength(1000);
            entity.HasOne(e => e.Patient)
                .WithOne(p => p.PhysicalExamProfile)
                .HasForeignKey<PatientPhysicalExamProfile>(e => e.PatientId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId }).IsUnique();
        });

        modelBuilder.Entity<NcdRiskAssessment>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.DiagnosedDiabetes).HasMaxLength(10);
            entity.Property(e => e.DiabetesMedicationStatus).HasMaxLength(10);
            entity.Property(e => e.FastingBloodSugarMgDl).HasPrecision(6, 2);
            entity.Property(e => e.FastingBloodSugarMmolL).HasPrecision(6, 2);
            entity.Property(e => e.TotalCholesterolMgDl).HasPrecision(6, 2);
            entity.Property(e => e.UrineKetonesValue).HasMaxLength(50);
            entity.Property(e => e.UrineProteinValue).HasMaxLength(50);
            entity.Property(e => e.RiskBand).IsRequired().HasMaxLength(50).HasDefaultValue("BandA");
            entity.Property(e => e.CalculatedRiskScorePercent).HasPrecision(5, 2);
            entity.Property(e => e.AssessedByStaffName).HasMaxLength(150);
            entity.Property(e => e.Remarks).HasMaxLength(1000);
            entity.HasOne(e => e.Patient)
                .WithMany(p => p.NcdRiskAssessments)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.AssessmentDate });
        });

        modelBuilder.Entity<PatientProblem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Icd10Code).IsRequired().HasMaxLength(20);
            entity.Property(e => e.ProblemTitle).IsRequired().HasMaxLength(255);
            entity.Property(e => e.PhilHealthMdiseaseCode).HasMaxLength(20);
            entity.Property(e => e.ClinicalNotes).HasMaxLength(1000);
            entity.Property(e => e.RecordedByDoctorName).IsRequired().HasMaxLength(150);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.Status });
            entity.HasIndex(e => new { e.ClinicId, e.Icd10Code });
        });

        modelBuilder.Entity<PatientAllergy>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Allergen).IsRequired().HasMaxLength(150);
            entity.Property(e => e.AllergenDrugCode).HasMaxLength(50);
            entity.Property(e => e.ReactionManifestation).HasMaxLength(500);
            entity.Property(e => e.Notes).HasMaxLength(1000);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.Category });
        });

        modelBuilder.Entity<PatientPastMedicalHistory>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ConditionTitle).IsRequired().HasMaxLength(255);
            entity.Property(e => e.PhilHealthMdiseaseCode).HasMaxLength(50);
            entity.Property(e => e.Icd10Code).HasMaxLength(50);
            entity.Property(e => e.SpecificDescription).HasMaxLength(500);
            entity.Property(e => e.ClinicalNotes).HasMaxLength(1000);
            entity.HasOne(e => e.Patient)
                .WithMany(p => p.PastMedicalHistories)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.PhilHealthMdiseaseCode });
        });

        modelBuilder.Entity<PatientFamilyHistory>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ConditionTitle).IsRequired().HasMaxLength(255);
            entity.Property(e => e.PhilHealthMdiseaseCode).HasMaxLength(50);
            entity.Property(e => e.Icd10Code).HasMaxLength(50);
            entity.Property(e => e.SpecificDescription).HasMaxLength(500);
            entity.Property(e => e.Relationship).HasMaxLength(100);
            entity.Property(e => e.ClinicalNotes).HasMaxLength(1000);
            entity.HasOne(e => e.Patient)
                .WithMany(p => p.FamilyHistories)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.PhilHealthMdiseaseCode });
        });

        modelBuilder.Entity<PatientImmunization>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.PhilHealthLibrary).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PhilHealthCode).IsRequired().HasMaxLength(20);
            entity.Property(e => e.VaccineName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.BrandName).HasMaxLength(150);
            entity.Property(e => e.Manufacturer).HasMaxLength(150);
            entity.Property(e => e.LotBatchNumber).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Route).IsRequired().HasMaxLength(50);
            entity.Property(e => e.InjectionSite).IsRequired().HasMaxLength(100);
            entity.Property(e => e.AdministeredByStaffName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.AdministeredByPrcLicense).HasMaxLength(50);
            entity.Property(e => e.AdverseReactionSeverity).IsRequired().HasMaxLength(50).HasDefaultValue("None");
            entity.Property(e => e.AdverseReactionRemarks).HasMaxLength(1000);
            entity.Property(e => e.HistoricalFacilityName).HasMaxLength(150);
            entity.Property(e => e.Remarks).HasMaxLength(1000);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.AdministeredAtUtc });
            entity.HasIndex(e => new { e.LotBatchNumber, e.ExpirationDate });
        });

        modelBuilder.Entity<MedicalCertificate>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.CertificateNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.DoctorName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.PrcLicenseNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.FitnessStatus).HasMaxLength(50);
            entity.Property(e => e.Purpose).HasMaxLength(50);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.CertificateNumber }).IsUnique();
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
        });

        modelBuilder.Entity<ReferralLetter>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ReferralNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.ReferringDoctorName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.ReferredToFacility).IsRequired().HasMaxLength(150);
            entity.Property(e => e.ReferredDepartment).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Urgency).HasMaxLength(50);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.ReferralNumber }).IsUnique();
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
        });

        modelBuilder.Entity<ClinicRecordAttachment>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.RecordType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.FileName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.ContentType).HasMaxLength(100);
            entity.Property(e => e.VerificationStatus).HasMaxLength(50).HasDefaultValue("Verified");
            entity.Property(e => e.RejectionReason).HasMaxLength(255);
            entity.Property(e => e.VerifiedByStaffName).HasMaxLength(150);
            entity.Property(e => e.EncryptionAlgorithm).HasMaxLength(50).HasDefaultValue("AES-256-GCM");
            entity.Property(e => e.EncryptionKeyId).HasMaxLength(100);
            entity.Property(e => e.EncryptionIvBase64).HasMaxLength(100);
            entity.Property(e => e.EncryptionTagBase64).HasMaxLength(100);
            entity.Property(e => e.EncryptedHash).HasMaxLength(100);
            entity.Property(e => e.WrappedKeyJson).HasColumnType("text");
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
        });

        modelBuilder.Entity<ClinicCustomFieldDefinition>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.EntityType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.FieldKey).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Label).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Category).HasMaxLength(50);
            entity.Property(e => e.Placeholder).HasMaxLength(200);
            entity.Property(e => e.OptionsJson).HasColumnType("text");
            entity.Property(e => e.VisibilityRuleJson).HasColumnType("text");
            entity.Property(e => e.ConditionalOptionsJson).HasColumnType("text");
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.EntityType, e.FieldKey });
        });

        modelBuilder.Entity<ClinicSettings>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TenantSlug).HasMaxLength(100);
            entity.Property(e => e.FacilitySlug).HasMaxLength(100);
            entity.Property(e => e.ClinicName).IsRequired().HasMaxLength(200);
            entity.Property(e => e.AccreditationNumber).HasMaxLength(100);
            entity.Property(e => e.PmccNumber).HasMaxLength(100);
            entity.Property(e => e.SoftwareCertificateId).HasMaxLength(100);
            entity.Property(e => e.KonsultaEndpoint).HasMaxLength(255);
            entity.Property(e => e.DefaultConsultationFee).HasPrecision(18, 2);
            entity.Property(e => e.VatRate).HasPrecision(5, 4);
            entity.Property(e => e.PreferredChartLayout).HasMaxLength(50).HasDefaultValue("modal");
            entity.Property(e => e.IsJoinEnabled).HasDefaultValue(true);
            entity.Property(e => e.JoinCode).HasMaxLength(50);
            entity.Property(e => e.JoinCodeExpiresAt);
            entity.Property(e => e.PatientSearchDisplayFieldsJson).HasColumnType("text");
            entity.Property(e => e.EodReconciliationTime).HasMaxLength(10).HasDefaultValue("21:00");
            entity.Property(e => e.AutoEodEnabled).HasDefaultValue(true);
            entity.Property(e => e.TvDisplayMaskPatientNames).HasDefaultValue(true);
            entity.Property(e => e.EnableQueuePushNotifications).HasDefaultValue(true);
            entity.Property(e => e.QueuePushNotificationThreshold).HasDefaultValue(2);
            entity.Property(e => e.EnableChipLevelQueueCalling).HasDefaultValue(false);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId }).IsUnique();
        });

        modelBuilder.Entity<EodReconciliationAudit>(entity =>
        {
            entity.ToTable("EodReconciliationAudits", "clinic_dashboard");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TriggerType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.ReconciledBy).IsRequired().HasMaxLength(150);
            entity.Property(e => e.AffectedTicketNumbersJson).HasColumnType("text");
            entity.Property(e => e.Notes).HasMaxLength(500);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.ReconciliationDate });
        });


        modelBuilder.Entity<YakapTransmittal>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TransmittalNumber).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ReportTagging).IsRequired().HasMaxLength(10);
            entity.Property(e => e.EffectiveYear).IsRequired().HasMaxLength(10);
            entity.Property(e => e.PackageType).IsRequired().HasMaxLength(20);
            entity.Property(e => e.PhilHealthTransactionNumber).HasMaxLength(100);
            entity.Property(e => e.EncryptedPayloadHash).HasMaxLength(128);
            entity.Property(e => e.SubmittedBy).HasMaxLength(150);
            entity.Property(e => e.ValidationErrors).HasConversion(permissionsConverter, stringListComparer);

            entity.HasMany(e => e.Items)
                .WithOne(i => i.Transmittal)
                .HasForeignKey(i => i.YakapTransmittalId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.TransmittalNumber });
            entity.HasIndex(e => new { e.TenantId, e.BranchId });
        });

        modelBuilder.Entity<YakapTransmittalItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.PhilHealthIdentificationNumber).IsRequired().HasMaxLength(30);
            entity.Property(e => e.ItemType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.ReportStatus).HasMaxLength(10).HasDefaultValue("U");
            entity.Property(e => e.DeficiencyRemarks).HasMaxLength(500);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.YakapTransmittalId });
        });

        // PhilHealth Catalog: official lib_* libraries shared by every clinic on this server (no tenant filter).
        modelBuilder.Entity<PhilHealthCatalogItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Library).IsRequired().HasMaxLength(64);
            entity.Property(e => e.ItemKey).IsRequired().HasMaxLength(160);
            entity.Property(e => e.Code).IsRequired().HasMaxLength(128);
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.AttributesJson).HasColumnType("text");
            entity.Property(e => e.KitVersion).HasMaxLength(40);
            entity.HasIndex(e => new { e.Library, e.ItemKey }).IsUnique();
            entity.HasIndex(e => new { e.Library, e.Code });
        });

        modelBuilder.Entity<PhilHealthCatalogImportLog>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Library).IsRequired().HasMaxLength(64);
            entity.Property(e => e.KitVersion).HasMaxLength(40);
            entity.Property(e => e.ContentHash).HasMaxLength(64);
            entity.Property(e => e.Message).HasMaxLength(500);
            entity.HasIndex(e => new { e.Library, e.CreatedAt });
        });

        modelBuilder.Entity<IdempotencyRecord>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Scope).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Key).IsRequired().HasMaxLength(128);
            entity.Property(e => e.Method).IsRequired().HasMaxLength(10);
            entity.Property(e => e.Path).IsRequired().HasMaxLength(500);
            entity.Property(e => e.RequestHash).IsRequired().HasMaxLength(64);
            entity.Property(e => e.ContentType).HasMaxLength(200);
            entity.Property(e => e.ResponseBody).HasColumnType("text");
            entity.HasIndex(e => new { e.Scope, e.Key }).IsUnique();
            entity.HasIndex(e => e.CreatedAt);
        });

        // Interop transactional outbox and inbox
        modelBuilder.ApplyInteropModel();

        modelBuilder.ApplyWorkspaceProfileModel();

        base.OnModelCreating(modelBuilder);
    }

    private static readonly object _inMemoryUniqueLock = new();

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        if (!Database.IsRelational())
        {
            lock (_inMemoryUniqueLock)
            {
                EnforceInMemoryUniqueConstraints();
                return base.SaveChangesAsync(cancellationToken).GetAwaiter().GetResult();
            }
        }
        return await base.SaveChangesAsync(cancellationToken);
    }

    private void EnforceInMemoryUniqueConstraints()
    {
        var addedPatients = ChangeTracker.Entries<ClinicPatient>()
            .Where(e => e.State == EntityState.Added)
            .Select(e => e.Entity)
            .ToList();

        if (addedPatients.Count > 0)
        {
            var duplicateInBatch = addedPatients
                .GroupBy(p => (p.TenantId, p.ClinicId, p.PatientCode))
                .FirstOrDefault(g => g.Count() > 1);

            if (duplicateInBatch != null)
            {
                var sample = duplicateInBatch.First();
                throw new DbUpdateException(
                    $"23505: duplicate key value violates unique constraint \"IX_ClinicPatients_ClinicId_PatientCode\". Key (tenant_id, clinic_id, patient_code)=({sample.TenantId}, {sample.ClinicId}, {sample.PatientCode}) already exists.",
                    new InvalidOperationException($"23505: duplicate key value violates unique constraint \"IX_ClinicPatients_ClinicId_PatientCode\""));
            }

            foreach (var p in addedPatients)
            {
                if (p.PatientCode != null)
                {
                    var exists = Patients.Local.Any(existing =>
                        existing != p &&
                        existing.TenantId == p.TenantId &&
                        existing.ClinicId == p.ClinicId &&
                        string.Equals(existing.PatientCode, p.PatientCode, StringComparison.OrdinalIgnoreCase))
                        || Patients.IgnoreQueryFilters().Any(existing =>
                        existing.Id != p.Id &&
                        existing.TenantId == p.TenantId &&
                        existing.ClinicId == p.ClinicId &&
                        existing.PatientCode == p.PatientCode);

                    if (exists)
                    {
                        throw new DbUpdateException(
                            $"23505: duplicate key value violates unique constraint \"IX_ClinicPatients_ClinicId_PatientCode\". Key (tenant_id, clinic_id, patient_code)=({p.TenantId}, {p.ClinicId}, {p.PatientCode}) already exists.",
                            new InvalidOperationException($"23505: duplicate key value violates unique constraint \"IX_ClinicPatients_ClinicId_PatientCode\""));
                    }
                }
            }
        }

        var addedTrackers = ChangeTracker.Entries<PatientCodeSequenceTracker>()
            .Where(e => e.State == EntityState.Added)
            .Select(e => e.Entity)
            .ToList();

        if (addedTrackers.Count > 0)
        {
            foreach (var t in addedTrackers)
            {
                var exists = PatientCodeSequenceTrackers.Local.Any(existing =>
                    existing != t &&
                    existing.TenantId == t.TenantId &&
                    existing.ClinicId == t.ClinicId &&
                    existing.Year == t.Year)
                    || PatientCodeSequenceTrackers.IgnoreQueryFilters().Any(existing =>
                    existing.Id != t.Id &&
                    existing.TenantId == t.TenantId &&
                    existing.ClinicId == t.ClinicId &&
                    existing.Year == t.Year);

                if (exists)
                {
                    throw new DbUpdateException(
                        $"23505: duplicate key value violates unique constraint \"IX_PatientCodeSequenceTrackers_TenantId_ClinicId_Year\". Key (tenant_id, clinic_id, year)=({t.TenantId}, {t.ClinicId}, {t.Year}) already exists.",
                        new InvalidOperationException($"23505: duplicate key value violates unique constraint \"IX_PatientCodeSequenceTrackers_TenantId_ClinicId_Year\""));
                }
            }
        }
    }
}
