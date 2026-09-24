using System;
using System.Collections.Generic;
using System.Text.Json;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MassTransit;
using Microsoft.EntityFrameworkCore;
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
    public DbSet<Appointment> Appointments { get; set; } = null!;
    public DbSet<QueueItem> QueueItems { get; set; } = null!;
    public DbSet<TriageVitals> TriageVitals { get; set; } = null!;
    public DbSet<ConsultationEncounter> Consultations { get; set; } = null!;
    public DbSet<EncounterDiagnosis> Diagnoses { get; set; } = null!;
    public DbSet<PrescriptionItem> Prescriptions { get; set; } = null!;

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



        modelBuilder.Entity<EncounterDiagnosis>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<PrescriptionItem>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Product>().HasQueryFilter(e => !e.IsDeleted);

        // 3. Entity Configurations
        var permissionsConverter = new ValueConverter<List<string>, string>(
            v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
            v => string.IsNullOrEmpty(v) ? new List<string>() : JsonSerializer.Deserialize<List<string>>(v, (JsonSerializerOptions?)null) ?? new List<string>()
        );

        modelBuilder.Entity<ClinicRole>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Description).HasMaxLength(255);
            entity.Property(e => e.Permissions).HasConversion(permissionsConverter);
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

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
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

        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Sku).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Price).HasPrecision(18, 2);
        });

        // MassTransit outbox
        modelBuilder.AddInboxStateEntity();
        modelBuilder.AddOutboxStateEntity();
        modelBuilder.AddOutboxMessageEntity();

        base.OnModelCreating(modelBuilder);
    }
}
