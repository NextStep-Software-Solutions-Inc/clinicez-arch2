using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Infrastructure.Persistence.Configurations;

public sealed class VitalSignsConfiguration : IEntityTypeConfiguration<VitalSigns>
{
    public void Configure(EntityTypeBuilder<VitalSigns> builder)
    {
        builder.HasKey(v => v.Id);
        builder.Property(v => v.WeightKg).HasPrecision(5, 2);
        builder.Property(v => v.HeightCm).HasPrecision(5, 1);
        builder.Property(v => v.Bmi).HasPrecision(5, 2);
        builder.Property(v => v.TemperatureCelsius).HasPrecision(4, 1);
        builder.Property(v => v.OxygenSaturationPercent).HasPrecision(4, 1);
        builder.Property(v => v.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(v => v.UpdatedBy).HasMaxLength(128);

        builder.HasOne(v => v.Patient)
            .WithMany(p => p.VitalSigns)
            .HasForeignKey(v => v.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(v => v.Consultation)
            .WithMany(c => c.VitalSigns)
            .HasForeignKey(v => v.ConsultationId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(v => new { v.PatientId, v.RecordedAt });
    }
}

public sealed class ConsultationConfiguration : IEntityTypeConfiguration<Consultation>
{
    public void Configure(EntityTypeBuilder<Consultation> builder)
    {
        builder.HasKey(c => c.Id);
        builder.Property(c => c.ChiefComplaint).HasMaxLength(500);
        builder.Property(c => c.Assessment).HasMaxLength(2000);
        builder.Property(c => c.Diagnosis).HasMaxLength(500);
        builder.Property(c => c.Icd10Code).HasMaxLength(20);
        builder.Property(c => c.Plan).HasMaxLength(2000);
        builder.Property(c => c.Notes).HasMaxLength(2000);
        builder.Property(c => c.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(c => c.UpdatedBy).HasMaxLength(128);

        builder.HasOne(c => c.Patient)
            .WithMany(p => p.Consultations)
            .HasForeignKey(c => c.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(c => new { c.PatientId, c.ConsultedAt });
    }
}

public sealed class PrescriptionConfiguration : IEntityTypeConfiguration<Prescription>
{
    public void Configure(EntityTypeBuilder<Prescription> builder)
    {
        builder.HasKey(p => p.Id);
        builder.Property(p => p.MedicationName).HasMaxLength(200).IsRequired();
        builder.Property(p => p.GenericName).HasMaxLength(200);
        builder.Property(p => p.Dosage).HasMaxLength(100);
        builder.Property(p => p.Frequency).HasMaxLength(100);
        builder.Property(p => p.Duration).HasMaxLength(100);
        builder.Property(p => p.Instructions).HasMaxLength(500);
        builder.Property(p => p.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(p => p.UpdatedBy).HasMaxLength(128);

        builder.HasOne(p => p.Consultation)
            .WithMany(c => c.Prescriptions)
            .HasForeignKey(p => p.ConsultationId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(p => p.Patient)
            .WithMany()
            .HasForeignKey(p => p.PatientId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class LabResultConfiguration : IEntityTypeConfiguration<LabResult>
{
    public void Configure(EntityTypeBuilder<LabResult> builder)
    {
        builder.HasKey(l => l.Id);
        builder.Property(l => l.TestName).HasMaxLength(200).IsRequired();
        builder.Property(l => l.Category).HasConversion<string>().HasMaxLength(40);
        builder.Property(l => l.Status).HasConversion<string>().HasMaxLength(30);
        builder.Property(l => l.Result).HasMaxLength(500);
        builder.Property(l => l.ReferenceRange).HasMaxLength(100);
        builder.Property(l => l.Unit).HasMaxLength(50);
        builder.Property(l => l.FileUrl).HasMaxLength(500);
        builder.Property(l => l.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(l => l.UpdatedBy).HasMaxLength(128);

        builder.HasOne(l => l.Patient)
            .WithMany(p => p.LabResults)
            .HasForeignKey(l => l.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(l => l.Consultation)
            .WithMany(c => c.LabResults)
            .HasForeignKey(l => l.ConsultationId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class ImagingResultConfiguration : IEntityTypeConfiguration<ImagingResult>
{
    public void Configure(EntityTypeBuilder<ImagingResult> builder)
    {
        builder.HasKey(i => i.Id);
        builder.Property(i => i.Modality).HasConversion<string>().HasMaxLength(30);
        builder.Property(i => i.BodyPart).HasMaxLength(100);
        builder.Property(i => i.Findings).HasMaxLength(2000);
        builder.Property(i => i.Impression).HasMaxLength(1000);
        builder.Property(i => i.ImageUrl).HasMaxLength(500);
        builder.Property(i => i.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(i => i.UpdatedBy).HasMaxLength(128);

        builder.HasOne(i => i.Patient)
            .WithMany(p => p.ImagingResults)
            .HasForeignKey(i => i.PatientId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(i => i.Consultation)
            .WithMany(c => c.ImagingResults)
            .HasForeignKey(i => i.ConsultationId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
