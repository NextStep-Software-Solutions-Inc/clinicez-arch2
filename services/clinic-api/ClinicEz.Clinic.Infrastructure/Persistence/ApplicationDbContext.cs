using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Workspace;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

public class ApplicationDbContext : DbContext, IInteropDbContext, IWorkspaceProfileDbContext, IDataProtectionKeyContext, IReadDbContext
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
    public DbSet<Role> Roles { get; set; } = null!;
    public DbSet<Room> Rooms { get; set; } = null!;
    public DbSet<StaffMember> StaffMembers { get; set; } = null!;
    public DbSet<RefreshToken> RefreshTokens { get; set; } = null!;
    public DbSet<Appointment> Appointments { get; set; } = null!;
    public DbSet<QueueItem> QueueItems { get; set; } = null!;
    public DbSet<PatientVitals> PatientVitals { get; set; } = null!;
    public DbSet<ConsultationEncounter> Consultations { get; set; } = null!;
    public DbSet<EncounterDiagnosis> Diagnoses { get; set; } = null!;
    public DbSet<PrescriptionItem> Prescriptions { get; set; } = null!;
    public DbSet<ServiceItem> ServiceItems { get; set; } = null!;
    public DbSet<Invoice> Invoices { get; set; } = null!;
    public DbSet<InvoiceLineItem> InvoiceLineItems { get; set; } = null!;
    public DbSet<PaymentRecord> Payments { get; set; } = null!;
    public DbSet<Procedure> Procedures { get; set; } = null!;
    public DbSet<LabOrder> LabOrders { get; set; } = null!;
    public DbSet<LabOrderItem> LabOrderItems { get; set; } = null!;
    public DbSet<LabObservation> LabObservations { get; set; } = null!;
    public DbSet<LabResult> LabResults { get; set; } = null!;
    public DbSet<Patient> Patients { get; set; } = null!;
    public DbSet<PatientPhilHealthMembership> PatientPhilHealthMemberships { get; set; } = null!;
    public DbSet<PatientYakapEnlistment> PatientYakapEnlistments { get; set; } = null!;
    public DbSet<PatientAlert> PatientAlerts { get; set; } = null!;
    public DbSet<PatientAllergy> PatientAllergies { get; set; } = null!;
    public DbSet<PatientMedicalHistory> PatientMedicalHistories { get; set; } = null!;
    public DbSet<PatientPhysicalExam> PatientPhysicalExams { get; set; } = null!;
    public DbSet<PatientPhysicalExamFinding> PatientPhysicalExamFindings { get; set; } = null!;
    public DbSet<PatientImmunization> PatientImmunizations { get; set; } = null!;
    public DbSet<PatientReproductiveHistory> PatientReproductiveHistories { get; set; } = null!;
    public DbSet<PatientSocialHistory> PatientSocialHistories { get; set; } = null!;
    public DbSet<PatientFamilyHistory> PatientFamilyHistories { get; set; } = null!;
    public DbSet<PatientSurgicalHistory> PatientSurgicalHistories { get; set; } = null!;
    public DbSet<NcdRiskAssessment> NcdRiskAssessments { get; set; } = null!;
    public DbSet<MedicalCertificate> MedicalCertificates { get; set; } = null!;
    public DbSet<ReferralLetter> ReferralLetters { get; set; } = null!;
    public DbSet<RecordAttachment> RecordAttachments { get; set; } = null!;
    public DbSet<CustomFieldDefinition> CustomFieldDefinitions { get; set; } = null!;
    public DbSet<FacilitySettings> Settings { get; set; } = null!;
    public DbSet<StaffNotification> StaffNotifications { get; set; } = null!;
    public DbSet<AuditEntry> AuditEntries { get; set; } = null!;
    public DbSet<DentalToothRecord> DentalToothRecords { get; set; } = null!;
    public DbSet<DoctorScheduleTemplate> DoctorScheduleTemplates { get; set; } = null!;
    public DbSet<DoctorBreakTime> DoctorBreakTimes { get; set; } = null!;
    public DbSet<DoctorLeave> DoctorLeaves { get; set; } = null!;
    public DbSet<DoctorScheduleOverride> DoctorScheduleOverrides { get; set; } = null!;
    public DbSet<EodReconciliationAudit> EodReconciliationAudits { get; set; } = null!;
    public DbSet<PatientAddress> PatientAddresses { get; set; } = null!;
    public DbSet<PatientGuardian> PatientGuardians { get; set; } = null!;
    public DbSet<PatientIdentityVerification> PatientIdentityVerifications { get; set; } = null!;
    public DbSet<PatientHospitalizationHistory> PatientHospitalizationHistories { get; set; } = null!;
    public DbSet<PatientInjuryHistory> PatientInjuryHistories { get; set; } = null!;
    public DbSet<PatientHomeMedication> PatientHomeMedications { get; set; } = null!;
    public DbSet<PatientSexualHistory> PatientSexualHistories { get; set; } = null!;
    public DbSet<EncounterReviewOfSystemsItem> EncounterReviewOfSystemsItems { get; set; } = null!;
    public DbSet<EncounterObGyneExam> EncounterObGyneExams { get; set; } = null!;
    public DbSet<EncounterPediatricMilestone> EncounterPediatricMilestones { get; set; } = null!;
    public DbSet<EncounterPediatricDangerSign> EncounterPediatricDangerSigns { get; set; } = null!;
    public DbSet<EncounterAdolescentAssessment> EncounterAdolescentAssessments { get; set; } = null!;
    public DbSet<EncounterHeadsssDomainAssessment> EncounterHeadsssDomainAssessments { get; set; } = null!;
    public DbSet<PatientBpMonitoringLog> PatientBpMonitoringLogs { get; set; } = null!;
    public DbSet<PatientBpMonitoringDay> PatientBpMonitoringDays { get; set; } = null!;
    public DbSet<YakapSubmission> YakapSubmissions { get; set; } = null!;
    public DbSet<YakapSubmissionError> YakapSubmissionErrors { get; set; } = null!;
    public DbSet<PhilHealthSequenceTracker> PhilHealthSequenceTrackers { get; set; } = null!;
    public DbSet<PatientCodeSequenceTracker> PatientCodeSequenceTrackers { get; set; } = null!;
    public DbSet<PhilHealthCatalogItem> PhilHealthCatalogItems { get; set; } = null!;
    public DbSet<PhilHealthCatalogImportLog> PhilHealthCatalogImportLogs { get; set; } = null!;
    public DbSet<PsgcLocation> PsgcLocations { get; set; } = null!;
    public DbSet<IdempotencyRecord> IdempotencyRecords { get; set; } = null!;
    public DbSet<UploadGrant> UploadGrants { get; set; } = null!;
    public DbSet<ShareImport> ShareImports { get; set; } = null!;
    public DbSet<InteropOutboxMessage> InteropOutbox { get; set; } = null!;
    public DbSet<InteropInboxMessage> InteropInbox { get; set; } = null!;
    public DbSet<WorkspaceProfileRecord> WorkspaceProfiles => Set<WorkspaceProfileRecord>();
    public DbSet<DataProtectionKey> DataProtectionKeys { get; set; } = null!;
    public DbSet<TeleconsultRecordingSession> TeleconsultRecordingSessions { get; set; } = null!;
    public DbSet<TeleconsultRecordingSegment> TeleconsultRecordingSegments { get; set; } = null!;
    public DbSet<PhilHealthDailySequence> PhilHealthDailySequences => Set<PhilHealthDailySequence>();

    // IReadDbContext Implementation
    IQueryable<Patient> IReadDbContext.Patients => Patients.AsNoTracking();
    IQueryable<Appointment> IReadDbContext.Appointments => Appointments.AsNoTracking();
    IQueryable<QueueItem> IReadDbContext.QueueItems => QueueItems.AsNoTracking();
    IQueryable<ConsultationEncounter> IReadDbContext.Consultations => Consultations.AsNoTracking();
    IQueryable<LabOrder> IReadDbContext.LabOrders => LabOrders.AsNoTracking();
    IQueryable<PrescriptionItem> IReadDbContext.PrescriptionItems => Prescriptions.AsNoTracking();
    IQueryable<PatientAddress> IReadDbContext.PatientAddresses => PatientAddresses.AsNoTracking();
    IQueryable<PhilHealthDailySequence> IReadDbContext.PhilHealthDailySequences => PhilHealthDailySequences.AsNoTracking();

    public Guid CurrentClinicId => _clinicContext?.ClinicId ?? Guid.Empty;

    /// <summary>Every enum is persisted as its C# name (nullable enums included), never as a number.</summary>
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<Enum>().HaveConversion<string>().HaveMaxLength(50);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var schemaName = _configuration["DbSchema"] ?? "public";
        modelBuilder.HasDefaultSchema(schemaName);
        modelBuilder.HasPostgresExtension("btree_gist");
        modelBuilder.HasPostgresExtension("pg_trgm");

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
        modelBuilder.Entity<Role>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<Room>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<StaffMember>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<Appointment>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<DoctorScheduleTemplate>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<DoctorBreakTime>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<DoctorLeave>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<DoctorScheduleOverride>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<QueueItem>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientVitals>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ConsultationEncounter>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<EncounterDiagnosis>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PrescriptionItem>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<Product>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ServiceItem>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<Invoice>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<InvoiceLineItem>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PaymentRecord>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<Procedure>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<LabOrder>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<LabOrderItem>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<LabObservation>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<LabResult>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<Patient>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientPhilHealthMembership>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientYakapEnlistment>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientAlert>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientAllergy>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientMedicalHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientPhysicalExam>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientPhysicalExamFinding>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientImmunization>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientReproductiveHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientSocialHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientFamilyHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientSurgicalHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<NcdRiskAssessment>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<DentalToothRecord>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<MedicalCertificate>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ReferralLetter>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<RecordAttachment>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<CustomFieldDefinition>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<FacilitySettings>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<StaffNotification>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<RefreshToken>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<AuditEntry>().HasQueryFilter(e => e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientAddress>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientGuardian>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientIdentityVerification>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientHospitalizationHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientInjuryHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientHomeMedication>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientSexualHistory>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<EncounterReviewOfSystemsItem>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<EncounterObGyneExam>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<EncounterPediatricMilestone>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<EncounterPediatricDangerSign>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<EncounterAdolescentAssessment>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<EncounterHeadsssDomainAssessment>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientBpMonitoringLog>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PatientBpMonitoringDay>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<YakapSubmission>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<YakapSubmissionError>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<PhilHealthDailySequence>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<EodReconciliationAudit>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<UploadGrant>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<ShareImport>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<TeleconsultRecordingSession>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<TeleconsultRecordingSegment>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
        modelBuilder.Entity<IdempotencyRecord>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);

        // Interop transactional outbox and inbox
        modelBuilder.ApplyInteropModel();

        modelBuilder.ApplyWorkspaceProfileModel();

        // 2. Apply Modular Entity Configurations from Assembly
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);

        base.OnModelCreating(modelBuilder);
    }

    private static readonly object _inMemoryUniqueLock = new();

    public override int SaveChanges()
    {
        return SaveChanges(true);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        CascadeClinicAndTenantScopes();
        EnforceWormImmutability();

        if (!Database.IsRelational())
        {
            lock (_inMemoryUniqueLock)
            {
                EnforceInMemoryUniqueConstraints();
                return base.SaveChanges(acceptAllChangesOnSuccess);
            }
        }
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return SaveChangesAsync(true, cancellationToken);
    }

    public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        CascadeClinicAndTenantScopes();
        EnforceWormImmutability();

        if (!Database.IsRelational())
        {
            lock (_inMemoryUniqueLock)
            {
                EnforceInMemoryUniqueConstraints();
                return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken).GetAwaiter().GetResult();
            }
        }
        return await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void CascadeClinicAndTenantScopes()
    {
        var addedScoped = ChangeTracker.Entries<ClinicScopedEntity>()
            .Where(e => e.State == EntityState.Added)
            .ToList();

        foreach (var entry in addedScoped)
        {
            if (entry.Entity is InvoiceLineItem lineItem && lineItem.ClinicId == Guid.Empty)
            {
                if (lineItem.Invoice != null && lineItem.Invoice.ClinicId != Guid.Empty)
                {
                    lineItem.ClinicId = lineItem.Invoice.ClinicId;
                    lineItem.TenantId = lineItem.Invoice.TenantId;
                }
                else if (Invoices.Local.FirstOrDefault(i => i.Id == lineItem.InvoiceId) is { } inv && inv.ClinicId != Guid.Empty)
                {
                    lineItem.ClinicId = inv.ClinicId;
                    lineItem.TenantId = inv.TenantId;
                }
            }
            else if (entry.Entity is PaymentRecord pay && pay.ClinicId == Guid.Empty)
            {
                if (pay.Invoice != null && pay.Invoice.ClinicId != Guid.Empty)
                {
                    pay.ClinicId = pay.Invoice.ClinicId;
                    pay.TenantId = pay.Invoice.TenantId;
                }
                else if (Invoices.Local.FirstOrDefault(i => i.Id == pay.InvoiceId) is { } inv && inv.ClinicId != Guid.Empty)
                {
                    pay.ClinicId = inv.ClinicId;
                    pay.TenantId = inv.TenantId;
                }
            }
            else if (entry.Entity is EncounterDiagnosis diag && diag.ClinicId == Guid.Empty)
            {
                if (diag.ConsultationEncounter != null && diag.ConsultationEncounter.ClinicId != Guid.Empty)
                {
                    diag.ClinicId = diag.ConsultationEncounter.ClinicId;
                    diag.TenantId = diag.ConsultationEncounter.TenantId;
                }
                else if (Consultations.Local.FirstOrDefault(c => c.Id == diag.ConsultationEncounterId) is { } ce && ce.ClinicId != Guid.Empty)
                {
                    diag.ClinicId = ce.ClinicId;
                    diag.TenantId = ce.TenantId;
                }
            }
            else if (entry.Entity is LabOrderItem labItem && labItem.ClinicId == Guid.Empty)
            {
                if (labItem.LabOrder != null && labItem.LabOrder.ClinicId != Guid.Empty)
                {
                    labItem.ClinicId = labItem.LabOrder.ClinicId;
                    labItem.TenantId = labItem.LabOrder.TenantId;
                }
                else if (LabOrders.Local.FirstOrDefault(l => l.Id == labItem.LabOrderId) is { } lo && lo.ClinicId != Guid.Empty)
                {
                    labItem.ClinicId = lo.ClinicId;
                    labItem.TenantId = lo.TenantId;
                }
            }
            else if (entry.Entity is PrescriptionItem rxItem && rxItem.ClinicId == Guid.Empty)
            {
                if (rxItem.ConsultationEncounter != null && rxItem.ConsultationEncounter.ClinicId != Guid.Empty)
                {
                    rxItem.ClinicId = rxItem.ConsultationEncounter.ClinicId;
                    rxItem.TenantId = rxItem.ConsultationEncounter.TenantId;
                }
                else if (Consultations.Local.FirstOrDefault(c => c.Id == rxItem.ConsultationEncounterId) is { } ce && ce.ClinicId != Guid.Empty)
                {
                    rxItem.ClinicId = ce.ClinicId;
                    rxItem.TenantId = ce.TenantId;
                }
            }
            else if (entry.Entity is PatientPhysicalExamFinding finding && finding.ClinicId == Guid.Empty)
            {
                if (finding.PhysicalExam != null && finding.PhysicalExam.ClinicId != Guid.Empty)
                {
                    finding.ClinicId = finding.PhysicalExam.ClinicId;
                    finding.TenantId = finding.PhysicalExam.TenantId;
                }
                else if (PatientPhysicalExams.Local.FirstOrDefault(pe => pe.Id == finding.PhysicalExamId) is { } pe && pe.ClinicId != Guid.Empty)
                {
                    finding.ClinicId = pe.ClinicId;
                    finding.TenantId = pe.TenantId;
                }
            }
            else if (entry.Entity is PatientAddress addr && addr.ClinicId == Guid.Empty)
            {
                if (addr.Patient != null && addr.Patient.ClinicId != Guid.Empty)
                {
                    addr.ClinicId = addr.Patient.ClinicId;
                    addr.TenantId = addr.Patient.TenantId;
                }
                else if (Patients.Local.FirstOrDefault(p => p.Id == addr.PatientId) is { } pt && pt.ClinicId != Guid.Empty)
                {
                    addr.ClinicId = pt.ClinicId;
                    addr.TenantId = pt.TenantId;
                }
            }
            else if (entry.Entity is PatientGuardian guardian && guardian.ClinicId == Guid.Empty)
            {
                if (guardian.Patient != null && guardian.Patient.ClinicId != Guid.Empty)
                {
                    guardian.ClinicId = guardian.Patient.ClinicId;
                    guardian.TenantId = guardian.Patient.TenantId;
                }
                else if (Patients.Local.FirstOrDefault(p => p.Id == guardian.PatientId) is { } pt && pt.ClinicId != Guid.Empty)
                {
                    guardian.ClinicId = pt.ClinicId;
                    guardian.TenantId = pt.TenantId;
                }
            }
            else if (entry.Entity is PatientIdentityVerification verif && verif.ClinicId == Guid.Empty)
            {
                if (verif.Patient != null && verif.Patient.ClinicId != Guid.Empty)
                {
                    verif.ClinicId = verif.Patient.ClinicId;
                    verif.TenantId = verif.Patient.TenantId;
                }
                else if (Patients.Local.FirstOrDefault(p => p.Id == verif.PatientId) is { } pt && pt.ClinicId != Guid.Empty)
                {
                    verif.ClinicId = pt.ClinicId;
                    verif.TenantId = pt.TenantId;
                }
            }
            else if (entry.Entity is PatientHospitalizationHistory hosp && hosp.ClinicId == Guid.Empty)
            {
                if (hosp.Patient != null && hosp.Patient.ClinicId != Guid.Empty)
                {
                    hosp.ClinicId = hosp.Patient.ClinicId;
                    hosp.TenantId = hosp.Patient.TenantId;
                }
                else if (Patients.Local.FirstOrDefault(p => p.Id == hosp.PatientId) is { } pt && pt.ClinicId != Guid.Empty)
                {
                    hosp.ClinicId = pt.ClinicId;
                    hosp.TenantId = pt.TenantId;
                }
            }
            else if (entry.Entity is PatientInjuryHistory injury && injury.ClinicId == Guid.Empty)
            {
                if (injury.Patient != null && injury.Patient.ClinicId != Guid.Empty)
                {
                    injury.ClinicId = injury.Patient.ClinicId;
                    injury.TenantId = injury.Patient.TenantId;
                }
                else if (Patients.Local.FirstOrDefault(p => p.Id == injury.PatientId) is { } pt && pt.ClinicId != Guid.Empty)
                {
                    injury.ClinicId = pt.ClinicId;
                    injury.TenantId = pt.TenantId;
                }
            }
            else if (entry.Entity is PatientHomeMedication homeMed && homeMed.ClinicId == Guid.Empty)
            {
                if (homeMed.Patient != null && homeMed.Patient.ClinicId != Guid.Empty)
                {
                    homeMed.ClinicId = homeMed.Patient.ClinicId;
                    homeMed.TenantId = homeMed.Patient.TenantId;
                }
                else if (Patients.Local.FirstOrDefault(p => p.Id == homeMed.PatientId) is { } pt && pt.ClinicId != Guid.Empty)
                {
                    homeMed.ClinicId = pt.ClinicId;
                    homeMed.TenantId = pt.TenantId;
                }
            }
            else if (entry.Entity is PatientSexualHistory sexHist && sexHist.ClinicId == Guid.Empty)
            {
                if (sexHist.Patient != null && sexHist.Patient.ClinicId != Guid.Empty)
                {
                    sexHist.ClinicId = sexHist.Patient.ClinicId;
                    sexHist.TenantId = sexHist.Patient.TenantId;
                }
                else if (Patients.Local.FirstOrDefault(p => p.Id == sexHist.PatientId) is { } pt && pt.ClinicId != Guid.Empty)
                {
                    sexHist.ClinicId = pt.ClinicId;
                    sexHist.TenantId = pt.TenantId;
                }
            }
            else if (entry.Entity is EncounterReviewOfSystemsItem rosItem && rosItem.ClinicId == Guid.Empty)
            {
                if (rosItem.ConsultationEncounter != null && rosItem.ConsultationEncounter.ClinicId != Guid.Empty)
                {
                    rosItem.ClinicId = rosItem.ConsultationEncounter.ClinicId;
                    rosItem.TenantId = rosItem.ConsultationEncounter.TenantId;
                }
                else if (Consultations.Local.FirstOrDefault(c => c.Id == rosItem.ConsultationEncounterId) is { } ce && ce.ClinicId != Guid.Empty)
                {
                    rosItem.ClinicId = ce.ClinicId;
                    rosItem.TenantId = ce.TenantId;
                }
            }
            else if (entry.Entity is EncounterObGyneExam obGyne && obGyne.ClinicId == Guid.Empty)
            {
                if (obGyne.ConsultationEncounter != null && obGyne.ConsultationEncounter.ClinicId != Guid.Empty)
                {
                    obGyne.ClinicId = obGyne.ConsultationEncounter.ClinicId;
                    obGyne.TenantId = obGyne.ConsultationEncounter.TenantId;
                }
                else if (Consultations.Local.FirstOrDefault(c => c.Id == obGyne.ConsultationEncounterId) is { } ce && ce.ClinicId != Guid.Empty)
                {
                    obGyne.ClinicId = ce.ClinicId;
                    obGyne.TenantId = ce.TenantId;
                }
            }
            else if (entry.Entity is EncounterPediatricMilestone milestone && milestone.ClinicId == Guid.Empty)
            {
                if (milestone.ConsultationEncounter != null && milestone.ConsultationEncounter.ClinicId != Guid.Empty)
                {
                    milestone.ClinicId = milestone.ConsultationEncounter.ClinicId;
                    milestone.TenantId = milestone.ConsultationEncounter.TenantId;
                }
                else if (Consultations.Local.FirstOrDefault(c => c.Id == milestone.ConsultationEncounterId) is { } ce && ce.ClinicId != Guid.Empty)
                {
                    milestone.ClinicId = ce.ClinicId;
                    milestone.TenantId = ce.TenantId;
                }
            }
            else if (entry.Entity is EncounterPediatricDangerSign ds && ds.ClinicId == Guid.Empty)
            {
                if (ds.PediatricMilestone != null && ds.PediatricMilestone.ClinicId != Guid.Empty)
                {
                    ds.ClinicId = ds.PediatricMilestone.ClinicId;
                    ds.TenantId = ds.PediatricMilestone.TenantId;
                }
                else if (EncounterPediatricMilestones.Local.FirstOrDefault(m => m.Id == ds.PediatricMilestoneId) is { } pm && pm.ClinicId != Guid.Empty)
                {
                    ds.ClinicId = pm.ClinicId;
                    ds.TenantId = pm.TenantId;
                }
            }
            else if (entry.Entity is EncounterAdolescentAssessment adol && adol.ClinicId == Guid.Empty)
            {
                if (adol.ConsultationEncounter != null && adol.ConsultationEncounter.ClinicId != Guid.Empty)
                {
                    adol.ClinicId = adol.ConsultationEncounter.ClinicId;
                    adol.TenantId = adol.ConsultationEncounter.TenantId;
                }
                else if (Consultations.Local.FirstOrDefault(c => c.Id == adol.ConsultationEncounterId) is { } ce && ce.ClinicId != Guid.Empty)
                {
                    adol.ClinicId = ce.ClinicId;
                    adol.TenantId = ce.TenantId;
                }
            }
            else if (entry.Entity is EncounterHeadsssDomainAssessment hda && hda.ClinicId == Guid.Empty)
            {
                if (hda.ConsultationEncounter != null && hda.ConsultationEncounter.ClinicId != Guid.Empty)
                {
                    hda.ClinicId = hda.ConsultationEncounter.ClinicId;
                    hda.TenantId = hda.ConsultationEncounter.TenantId;
                }
                else if (Consultations.Local.FirstOrDefault(c => c.Id == hda.ConsultationEncounterId) is { } ce && ce.ClinicId != Guid.Empty)
                {
                    hda.ClinicId = ce.ClinicId;
                    hda.TenantId = ce.TenantId;
                }
            }
            else if (entry.Entity is PatientBpMonitoringLog bpLog && bpLog.ClinicId == Guid.Empty)
            {
                if (bpLog.Patient != null && bpLog.Patient.ClinicId != Guid.Empty)
                {
                    bpLog.ClinicId = bpLog.Patient.ClinicId;
                    bpLog.TenantId = bpLog.Patient.TenantId;
                }
                else if (Patients.Local.FirstOrDefault(p => p.Id == bpLog.PatientId) is { } pt && pt.ClinicId != Guid.Empty)
                {
                    bpLog.ClinicId = pt.ClinicId;
                    bpLog.TenantId = pt.TenantId;
                }
            }
            else if (entry.Entity is PatientBpMonitoringDay bpDay && bpDay.ClinicId == Guid.Empty)
            {
                if (bpDay.BpMonitoringLog != null && bpDay.BpMonitoringLog.ClinicId != Guid.Empty)
                {
                    bpDay.ClinicId = bpDay.BpMonitoringLog.ClinicId;
                    bpDay.TenantId = bpDay.BpMonitoringLog.TenantId;
                }
                else if (PatientBpMonitoringLogs.Local.FirstOrDefault(l => l.Id == bpDay.BpMonitoringLogId) is { } log && log.ClinicId != Guid.Empty)
                {
                    bpDay.ClinicId = log.ClinicId;
                    bpDay.TenantId = log.TenantId;
                }
            }
            else if (entry.Entity is YakapSubmission ysub && ysub.ClinicId == Guid.Empty)
            {
                if (ysub.ConsultationEncounter != null && ysub.ConsultationEncounter.ClinicId != Guid.Empty)
                {
                    ysub.ClinicId = ysub.ConsultationEncounter.ClinicId;
                    ysub.TenantId = ysub.ConsultationEncounter.TenantId;
                }
                else if (Consultations.Local.FirstOrDefault(c => c.Id == ysub.ConsultationEncounterId) is { } ce && ce.ClinicId != Guid.Empty)
                {
                    ysub.ClinicId = ce.ClinicId;
                    ysub.TenantId = ce.TenantId;
                }
            }
            else if (entry.Entity is YakapSubmissionError subErr && subErr.ClinicId == Guid.Empty)
            {
                if (subErr.YakapSubmission != null && subErr.YakapSubmission.ClinicId != Guid.Empty)
                {
                    subErr.ClinicId = subErr.YakapSubmission.ClinicId;
                    subErr.TenantId = subErr.YakapSubmission.TenantId;
                }
                else if (YakapSubmissions.Local.FirstOrDefault(s => s.Id == subErr.YakapSubmissionId) is { } sub && sub.ClinicId != Guid.Empty)
                {
                    subErr.ClinicId = sub.ClinicId;
                    subErr.TenantId = sub.TenantId;
                }
            }
            else if (entry.Entity is PhilHealthDailySequence pds && pds.ClinicId == Guid.Empty)
            {
                if (CurrentClinicId != Guid.Empty)
                {
                    pds.ClinicId = CurrentClinicId;
                }
            }

            if (entry.Entity.ClinicId == Guid.Empty && CurrentClinicId != Guid.Empty)
            {
                entry.Entity.ClinicId = CurrentClinicId;
            }

            if (string.IsNullOrWhiteSpace(entry.Entity.TenantId))
            {
                entry.Entity.TenantId = "default";
            }
        }
    }

    /// <summary>
    /// Enforces Write-Once-Read-Many (WORM) immutability on AuditEntry records in accordance
    /// with the Philippine Data Privacy Act (RA 10173). Any update, hard deletion, or soft deletion
    /// mutation triggers an immediate InvalidOperationException.
    /// </summary>
    private void EnforceWormImmutability()
    {
        var auditMutations = ChangeTracker.Entries<AuditEntry>()
            .Where(e => e.State is EntityState.Modified or EntityState.Deleted ||
                       (e.State is EntityState.Added && e.Entity.IsDeleted))
            .ToList();

        if (auditMutations.Count > 0)
        {
            var sample = auditMutations.First();
            throw new InvalidOperationException(
                $"ClinicAuditEntry is append-only (WORM). AuditEntry is append-only (WORM). {sample.State} operation on audit entry '{sample.Entity.Id}' is strictly prohibited by Philippine Data Privacy Act (RA 10173) and compliance policy.");
        }
    }

    private void EnforceInMemoryUniqueConstraints()
    {
        var addedPatients = ChangeTracker.Entries<Patient>()
            .Where(e => e.State == EntityState.Added && !e.Entity.IsDeleted)
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
                    $"23505: duplicate key value violates unique constraint \"IX_Patients_TenantId_ClinicId_PatientCode\" (IX_ClinicPatients_ClinicId_PatientCode). Key (tenant_id, clinic_id, patient_code)=({sample.TenantId}, {sample.ClinicId}, {sample.PatientCode}) already exists.",
                    new InvalidOperationException($"23505: duplicate key value violates unique constraint \"IX_Patients_TenantId_ClinicId_PatientCode\" (IX_ClinicPatients_ClinicId_PatientCode)"));
            }

            foreach (var p in addedPatients)
            {
                if (p.PatientCode != null)
                {
                    var exists = Patients.Local.Any(existing =>
                        existing != p &&
                        !existing.IsDeleted &&
                        existing.TenantId == p.TenantId &&
                        existing.ClinicId == p.ClinicId &&
                        string.Equals(existing.PatientCode, p.PatientCode, StringComparison.OrdinalIgnoreCase))
                        || Patients.IgnoreQueryFilters().Any(existing =>
                        existing.Id != p.Id &&
                        !existing.IsDeleted &&
                        existing.TenantId == p.TenantId &&
                        existing.ClinicId == p.ClinicId &&
                        existing.PatientCode == p.PatientCode);

                    if (exists)
                    {
                        throw new DbUpdateException(
                            $"23505: duplicate key value violates unique constraint \"IX_Patients_TenantId_ClinicId_PatientCode\" (IX_ClinicPatients_ClinicId_PatientCode). Key (tenant_id, clinic_id, patient_code)=({p.TenantId}, {p.ClinicId}, {p.PatientCode}) already exists.",
                            new InvalidOperationException($"23505: duplicate key value violates unique constraint \"IX_Patients_TenantId_ClinicId_PatientCode\" (IX_ClinicPatients_ClinicId_PatientCode)"));
                    }
                }
            }
        }

        var addedTrackers = ChangeTracker.Entries<PatientCodeSequenceTracker>()
            .Where(e => e.State == EntityState.Added && !e.Entity.IsDeleted)
            .Select(e => e.Entity)
            .ToList();

        if (addedTrackers.Count > 0)
        {
            foreach (var t in addedTrackers)
            {
                var exists = PatientCodeSequenceTrackers.Local.Any(existing =>
                    existing != t &&
                    !existing.IsDeleted &&
                    existing.TenantId == t.TenantId &&
                    existing.ClinicId == t.ClinicId &&
                    existing.Year == t.Year)
                    || PatientCodeSequenceTrackers.IgnoreQueryFilters().Any(existing =>
                    existing.Id != t.Id &&
                    !existing.IsDeleted &&
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

        var addedSessions = ChangeTracker.Entries<TeleconsultRecordingSession>()
            .Where(e => e.State == EntityState.Added && !e.Entity.IsDeleted)
            .Select(e => e.Entity)
            .ToList();

        if (addedSessions.Count > 0)
        {
            foreach (var s in addedSessions)
            {
                var exists = TeleconsultRecordingSessions.Local.Any(existing =>
                    existing != s &&
                    !existing.IsDeleted &&
                    existing.ClinicId == s.ClinicId &&
                    existing.CallId == s.CallId)
                    || TeleconsultRecordingSessions.IgnoreQueryFilters().Any(existing =>
                    existing.Id != s.Id &&
                    !existing.IsDeleted &&
                    existing.ClinicId == s.ClinicId &&
                    existing.CallId == s.CallId);

                if (exists)
                {
                    throw new DbUpdateException(
                        $"23505: duplicate key value violates unique constraint \"IX_TeleconsultRecordingSessions_ClinicId_CallId\". Key (clinic_id, call_id)=({s.ClinicId}, {s.CallId}) already exists.",
                        new InvalidOperationException($"23505: duplicate key value violates unique constraint \"IX_TeleconsultRecordingSessions_ClinicId_CallId\""));
                }
            }
        }

        var addedSegments = ChangeTracker.Entries<TeleconsultRecordingSegment>()
            .Where(e => e.State == EntityState.Added && !e.Entity.IsDeleted)
            .Select(e => e.Entity)
            .ToList();

        if (addedSegments.Count > 0)
        {
            foreach (var seg in addedSegments)
            {
                var exists = TeleconsultRecordingSegments.Local.Any(existing =>
                    existing != seg &&
                    !existing.IsDeleted &&
                    existing.SessionId == seg.SessionId &&
                    existing.SegmentIndex == seg.SegmentIndex)
                    || TeleconsultRecordingSegments.IgnoreQueryFilters().Any(existing =>
                    existing.Id != seg.Id &&
                    !existing.IsDeleted &&
                    existing.SessionId == seg.SessionId &&
                    existing.SegmentIndex == seg.SegmentIndex);

                if (exists)
                {
                    throw new DbUpdateException(
                        $"23505: duplicate key value violates unique constraint \"IX_TeleconsultRecordingSegments_SessionId_SegmentIndex\". Key (session_id, segment_index)=({seg.SessionId}, {seg.SegmentIndex}) already exists.",
                        new InvalidOperationException($"23505: duplicate key value violates unique constraint \"IX_TeleconsultRecordingSegments_SessionId_SegmentIndex\""));
                }
            }
        }
    }
}
