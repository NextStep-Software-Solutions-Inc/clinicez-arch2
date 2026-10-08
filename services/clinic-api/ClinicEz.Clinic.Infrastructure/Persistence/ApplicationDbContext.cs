using System;
using System.Collections.Generic;
using System.Text.Json;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

public class ApplicationDbContext : DbContext
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
    public DbSet<YakapTransmittal> YakapTransmittals { get; set; } = null!;
    public DbSet<YakapTransmittalItem> YakapTransmittalItems { get; set; } = null!;
    public DbSet<PhilHealthSequenceTracker> PhilHealthSequenceTrackers { get; set; } = null!;
    public DbSet<TenantLookupRecord> Tenants { get; set; } = null!;
    public DbSet<PhilHealthCatalogItem> PhilHealthCatalogItems { get; set; } = null!;
    public DbSet<PhilHealthCatalogImportLog> PhilHealthCatalogImportLogs { get; set; } = null!;
    public DbSet<IdempotencyRecord> IdempotencyRecords { get; set; } = null!;
    public DbSet<FacilityLookupRecord> Facilities { get; set; } = null!;

    public Guid CurrentClinicId => _clinicContext?.ClinicId ?? Guid.Empty;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var schemaName = _configuration["DbSchema"] ?? "clinic_dashboard";
        modelBuilder.HasDefaultSchema(schemaName);

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

        // 1. Mandatory Enum-to-String Value Conversion across the entire DB
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties())
            {
                if (property.ClrType.IsEnum)
                {
                    var converterType = typeof(EnumToStringConverter<>).MakeGenericType(property.ClrType);
                    var converter = (ValueConverter)Activator.CreateInstance(converterType)!;
                    property.SetValueConverter(converter);
                    property.SetColumnType("character varying(50)");
                }
            }
        }

        // 2. Multi-Tenant & Clinic Jurisdiction Global Query Filters
        modelBuilder.Entity<ClinicRole>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<StaffMember>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<Appointment>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<QueueItem>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<TriageVitals>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<ConsultationEncounter>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<ClinicServiceItem>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<Invoice>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<ClinicalProcedure>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<ClinicLabOrder>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<ClinicPatient>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<MedicalCertificate>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<ReferralLetter>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<ClinicRecordAttachment>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<ClinicCustomFieldDefinition>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<ClinicSettings>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<YakapTransmittal>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));
        modelBuilder.Entity<YakapTransmittalItem>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));

        modelBuilder.Entity<EncounterDiagnosis>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<PrescriptionItem>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Product>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<ClinicRefreshToken>().HasQueryFilter(e => !e.IsDeleted && (CurrentClinicId == Guid.Empty || e.ClinicId == CurrentClinicId));

        // 3. Entity Configurations
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

            entity.HasOne(e => e.ClinicRole)
                .WithMany(r => r.StaffMembers)
                .HasForeignKey(e => e.ClinicRoleId)
                .OnDelete(DeleteBehavior.SetNull);

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
            entity.Property(e => e.ServiceType).HasMaxLength(100);
            entity.Property(e => e.Reason).HasMaxLength(255);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => e.ScheduledAt);
        });

        modelBuilder.Entity<QueueItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.QueueNumber).IsRequired().HasMaxLength(20);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.DoctorName).HasMaxLength(150);
            entity.Property(e => e.ChiefComplaint).HasMaxLength(255);

            entity.HasOne(e => e.Appointment)
                .WithMany()
                .HasForeignKey(e => e.AppointmentId)
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
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
        });

        modelBuilder.Entity<ClinicLabOrder>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.OrderNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);

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
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientCode }).IsUnique();
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.LastName, e.FirstName });
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
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.EntityType, e.FieldKey });
        });

        modelBuilder.Entity<ClinicSettings>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ClinicName).IsRequired().HasMaxLength(200);
            entity.Property(e => e.AccreditationNumber).HasMaxLength(100);
            entity.Property(e => e.PmccNumber).HasMaxLength(100);
            entity.Property(e => e.SoftwareCertificateId).HasMaxLength(100);
            entity.Property(e => e.KonsultaEndpoint).HasMaxLength(255);
            entity.Property(e => e.DefaultConsultationFee).HasPrecision(18, 2);
            entity.Property(e => e.VatRate).HasPrecision(5, 4);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId }).IsUnique();
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

        modelBuilder.Entity<TenantLookupRecord>(entity =>
        {
            entity.ToTable("Tenants", "main", t => t.ExcludeFromMigrations());
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantSlug);
            entity.Property(e => e.Name);
            entity.Property(e => e.IsDeleted);
        });

        modelBuilder.Entity<FacilityLookupRecord>(entity =>
        {
            entity.ToTable("Facilities", "main", t => t.ExcludeFromMigrations());
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId);
            entity.Property(e => e.Name);
            entity.Property(e => e.Slug);
            entity.Property(e => e.IsDeleted);
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

        // MassTransit outbox
        modelBuilder.AddInboxStateEntity();
        modelBuilder.AddOutboxStateEntity();
        modelBuilder.AddOutboxMessageEntity();

        base.OnModelCreating(modelBuilder);
    }
}
