using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Workspace;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace ClinicEz.Clinic.Infrastructure.Persistence.Configurations;

public sealed class PatientConfiguration : IEntityTypeConfiguration<Patient>
{
    public void Configure(EntityTypeBuilder<Patient> entity)
    {
        var customFieldsConverter = new ValueConverter<Dictionary<string, object?>, string>(
            v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
            v => string.IsNullOrEmpty(v) ? new Dictionary<string, object?>() : JsonSerializer.Deserialize<Dictionary<string, object?>>(v, (JsonSerializerOptions?)null) ?? new Dictionary<string, object?>()
        );

        var customFieldsComparer = new ValueComparer<Dictionary<string, object?>>(
            (d1, d2) => d1 != null && d2 != null ? d1.Count == d2.Count && !d1.Except(d2).Any() : d1 == d2,
            d => d == null ? 0 : d.Aggregate(0, (a, p) => HashCode.Combine(a, p.Key.GetHashCode(), p.Value != null ? p.Value.GetHashCode() : 0)),
            d => d == null ? new Dictionary<string, object?>() : new Dictionary<string, object?>(d));


            entity.ToTable("Patients");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientCode).IsRequired().HasMaxLength(30);
            entity.Property(e => e.ShareGrantScopes).HasMaxLength(200);
            entity.Property(e => e.FirstName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.LastName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.MiddleName).HasMaxLength(100);
            entity.Property(e => e.Suffix).HasMaxLength(20);
            entity.Property(e => e.ContactNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.LandlineNumber).HasMaxLength(50);
            entity.Property(e => e.AlternateContactNumber).HasMaxLength(50);
            entity.Property(e => e.Sex).HasConversion<string>().HasMaxLength(50);
            entity.Property(e => e.GenderIdentity).HasMaxLength(50);
            entity.Property(e => e.Occupation).HasMaxLength(100);
            entity.Property(e => e.CivilStatus).HasMaxLength(50);
            entity.Property(e => e.VerificationStatus).HasMaxLength(50);
            entity.Property(e => e.BloodType).HasMaxLength(50);
            entity.Property(e => e.MaidenLastName).HasMaxLength(100);
            entity.Property(e => e.PreferredName).HasMaxLength(100);
            entity.Property(e => e.Nationality).HasMaxLength(100);
            entity.Property(e => e.Religion).HasMaxLength(100);
            entity.Property(e => e.PhilHealthNumber).HasMaxLength(30);
            entity.Property(e => e.SeniorCitizenId).HasMaxLength(50);
            entity.Property(e => e.PwdId).HasMaxLength(50);
            entity.Property(e => e.ClinicEzId).HasMaxLength(40);
            entity.Property(e => e.CloudPatientId);
            entity.Property(e => e.HasActiveSafetyAlert).HasDefaultValue(false);
            entity.Property(e => e.SearchText)
                .HasComputedColumnSql("lower(coalesce(\"FirstName\", '') || ' ' || coalesce(\"LastName\", '') || ' ' || coalesce(\"MiddleName\", '') || ' ' || coalesce(\"PatientCode\", '') || ' ' || coalesce(\"ContactNumber\", '') || ' ' || coalesce(\"PhilHealthNumber\", '') || ' ' || coalesce(\"ClinicEzId\", ''))", stored: true);
            entity.Property(e => e.CustomFields)
                .HasColumnType("jsonb")
                .HasConversion(customFieldsConverter, customFieldsComparer);

            entity.HasOne(p => p.PhilHealthMembership)
                .WithOne(m => m.Patient)
                .HasForeignKey<PatientPhilHealthMembership>(m => m.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.SocialHistory)
                .WithOne(s => s.Patient)
                .HasForeignKey<PatientSocialHistory>(s => s.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.ReproductiveHistory)
                .WithOne(r => r.Patient)
                .HasForeignKey<PatientReproductiveHistory>(r => r.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.YakapEnlistments)
                .WithOne(e => e.Patient)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.Alerts)
                .WithOne(a => a.Patient)
                .HasForeignKey(a => a.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.Allergies)
                .WithOne(a => a.Patient)
                .HasForeignKey(a => a.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.MedicalHistories)
                .WithOne(m => m.Patient)
                .HasForeignKey(m => m.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.PhysicalExams)
                .WithOne(e => e.Patient)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.Vitals)
                .WithOne(v => v.Patient)
                .HasForeignKey(v => v.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.SurgicalHistories)
                .WithOne(s => s.Patient)
                .HasForeignKey(s => s.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.FamilyHistories)
                .WithOne(f => f.Patient)
                .HasForeignKey(f => f.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.Immunizations)
                .WithOne(i => i.Patient)
                .HasForeignKey(i => i.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.NcdRiskAssessments)
                .WithOne(n => n.Patient)
                .HasForeignKey(n => n.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.DentalToothRecords)
                .WithOne(d => d.Patient)
                .HasForeignKey(d => d.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.Addresses)
                .WithOne(a => a.Patient)
                .HasForeignKey(a => a.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.Guardians)
                .WithOne(g => g.Patient)
                .HasForeignKey(g => g.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.IdentityVerifications)
                .WithOne(v => v.Patient)
                .HasForeignKey(v => v.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.HospitalizationHistories)
                .WithOne(h => h.Patient)
                .HasForeignKey(h => h.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.InjuryHistories)
                .WithOne(i => i.Patient)
                .HasForeignKey(i => i.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.HomeMedications)
                .WithOne(m => m.Patient)
                .HasForeignKey(m => m.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.SexualHistory)
                .WithOne(s => s.Patient)
                .HasForeignKey<PatientSexualHistory>(s => s.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.BpMonitoringLogs)
                .WithOne(b => b.Patient)
                .HasForeignKey(b => b.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(p => p.YakapSubmissions)
                .WithOne(y => y.Patient)
                .HasForeignKey(y => y.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientCode })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
            entity.HasIndex(e => new { e.ClinicId, e.CloudPatientId })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false AND \"CloudPatientId\" IS NOT NULL");
            entity.HasIndex(e => new { e.ClinicId, e.TenantId, e.LastName, e.FirstName })
                .HasFilter("\"IsDeleted\" = false");
            entity.HasIndex(e => new { e.ClinicId, e.ClinicEzId })
                .HasFilter("\"IsDeleted\" = false");
            entity.HasIndex(e => new { e.ClinicId, e.PatientCode })
                .HasFilter("\"IsDeleted\" = false");
            entity.HasIndex(e => e.SearchText)
                .HasMethod("gin")
                .HasOperators("gin_trgm_ops");
            entity.HasIndex(e => e.CustomFields)
                .HasMethod("gin")
                .HasOperators("jsonb_path_ops");
    }
}
