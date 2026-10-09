using System.Linq.Expressions;
using ClinicEz.Shared.Interfaces;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Infrastructure.Persistence;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class ApplicationDbContext : DbContext, IInteropDbContext
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
    public DbSet<PatientStorageProfile> PatientStorageProfiles => Set<PatientStorageProfile>();
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
    public DbSet<PatientHealthcareProvider> PatientHealthcareProviders => Set<PatientHealthcareProvider>();
    public DbSet<PatientImmunizationSelf> PatientImmunizationsSelf => Set<PatientImmunizationSelf>();
    public DbSet<PatientDisability> PatientDisabilities => Set<PatientDisability>();
    public DbSet<PatientTravelHistory> PatientTravelHistories => Set<PatientTravelHistory>();
    public DbSet<PatientContraceptiveHistory> PatientContraceptiveHistories => Set<PatientContraceptiveHistory>();
    public DbSet<PatientPregnancy> PatientPregnancies => Set<PatientPregnancy>();

    // ── One-to-one profiles ─────────────────────────────────────────────────
    public DbSet<PatientSocialHistory> PatientSocialHistories => Set<PatientSocialHistory>();
    public DbSet<PatientObstetricProfile> PatientObstetricProfiles => Set<PatientObstetricProfile>();
    public DbSet<PatientMentalHealthProfile> PatientMentalHealthProfiles => Set<PatientMentalHealthProfile>();
    public DbSet<PatientOccupation> PatientOccupations => Set<PatientOccupation>();
    public DbSet<PatientMaleReproductive> PatientMaleReproductives => Set<PatientMaleReproductive>();
    public DbSet<PatientDentalVision> PatientDentalVisions => Set<PatientDentalVision>();

    // ── Clinical records (HCW entry) ────────────────────────────────────────
    public DbSet<VitalSigns> VitalSigns => Set<VitalSigns>();
    public DbSet<Consultation> Consultations => Set<Consultation>();
    public DbSet<Prescription> Prescriptions => Set<Prescription>();
    public DbSet<LabResult> LabResults => Set<LabResult>();
    public DbSet<ImagingResult> ImagingResults => Set<ImagingResult>();
    public DbSet<VaccinationAdministered> VaccinationsAdministered => Set<VaccinationAdministered>();
    public DbSet<ClinicalAssessment> ClinicalAssessments => Set<ClinicalAssessment>();
    public DbSet<PatientPhysicalExamProfile> PatientPhysicalExamProfiles => Set<PatientPhysicalExamProfile>();
    public DbSet<PatientNcdQuestionnaire> PatientNcdQuestionnaires => Set<PatientNcdQuestionnaire>();

    // ── Documents issued to the patient by facilities ───────────────────────
    public DbSet<LabRequestSlip> LabRequestSlips => Set<LabRequestSlip>();
    public DbSet<PrescriptionDocument> PrescriptionDocuments => Set<PrescriptionDocument>();
    public DbSet<LabResultReport> LabResultReports => Set<LabResultReport>();
    public DbSet<MedicalCertificate> MedicalCertificates => Set<MedicalCertificate>();

    // ── Patient-controlled sharing ──────────────────────────────────────────
    public DbSet<PatientAccessGrant> PatientAccessGrants => Set<PatientAccessGrant>();
    public DbSet<PatientAccessLog> PatientAccessLogs => Set<PatientAccessLog>();
    public DbSet<ShareTokenUse> ShareTokenUses => Set<ShareTokenUse>();

    // ── Files & Appointments ────────────────────────────────────────────────
    public DbSet<FileFolder> FileFolders => Set<FileFolder>();
    public DbSet<FileRecord> FileRecords => Set<FileRecord>();
    public DbSet<Appointment> Appointments => Set<Appointment>();

    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<OrganizationRole> OrganizationRoles => Set<OrganizationRole>();
    public DbSet<Clinic> Clinics => Set<Clinic>();
    public DbSet<ClinicOrganizationLink> ClinicOrganizationLinks => Set<ClinicOrganizationLink>();
    public DbSet<ClinicHealthcareProvider> ClinicHealthcareProviders => Set<ClinicHealthcareProvider>();
    public DbSet<ProviderAvailability> ProviderAvailabilities => Set<ProviderAvailability>();
    public DbSet<ClinicService> ClinicServices => Set<ClinicService>();

    // ── Memberships ─────────────────────────────────────────────────────────
    public DbSet<OrganizationMembership> OrganizationMemberships => Set<OrganizationMembership>();
    public DbSet<ClinicMembership> ClinicMemberships => Set<ClinicMembership>();
    public DbSet<BookingDraft> BookingDrafts => Set<BookingDraft>();

    // ── Infrastructure ──────────────────────────────────────────────────────
    public DbSet<SyncLog> SyncLogs => Set<SyncLog>();
    public DbSet<DeviceSession> DeviceSessions => Set<DeviceSession>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<NotificationPreferences> NotificationPreferences => Set<NotificationPreferences>();
    public DbSet<DocumentType> DocumentTypes => Set<DocumentType>();

    // ── Interop hub outbox / inbox ──────────────────────────────────────────
    public DbSet<InteropOutboxMessage> InteropOutbox => Set<InteropOutboxMessage>();
    public DbSet<InteropInboxMessage> InteropInbox => Set<InteropInboxMessage>();

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

        modelBuilder.ApplyInteropModel();

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
                    if (entry.Entity is Patient { ClinicEzId.Length: 0 } patient)
                        patient.ClinicEzId = ClinicEzIdGenerator.Generate();
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

