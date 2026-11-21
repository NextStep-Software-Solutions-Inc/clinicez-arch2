using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Infrastructure.Persistence.Configurations;

public sealed class PatientSocialHistoryConfiguration : IEntityTypeConfiguration<PatientSocialHistory>
{
    public void Configure(EntityTypeBuilder<PatientSocialHistory> builder)
    {
        builder.HasKey(s => s.Id);
        builder.HasIndex(s => s.PatientId).IsUnique();
        builder.Property(s => s.SmokingStatus).HasConversion<string>().HasMaxLength(30);
        builder.Property(s => s.OtherTobaccoProducts).HasMaxLength(200);
        builder.Property(s => s.AlcoholUse).HasConversion<string>().HasMaxLength(30);
        builder.Property(s => s.AlcoholType).HasMaxLength(100);
        builder.Property(s => s.SubstanceName).HasMaxLength(200);
        builder.Property(s => s.SubstanceRoute).HasMaxLength(100);
        builder.Property(s => s.SubstanceFrequency).HasMaxLength(100);
        builder.Property(s => s.ActivityLevel).HasConversion<string>().HasMaxLength(30);
        builder.Property(s => s.ExerciseType).HasMaxLength(200);
        builder.Property(s => s.DietPattern).HasMaxLength(200);
        builder.Property(s => s.FoodRestrictions).HasMaxLength(500);
        builder.Property(s => s.SleepQuality).HasConversion<string>().HasMaxLength(20);
        builder.Property(s => s.WaterIntake).HasMaxLength(100);
        builder.Property(s => s.OccupationalHazards).HasMaxLength(500);
        builder.Property(s => s.PackYears).HasPrecision(5, 1);
        builder.Property(s => s.SleepAvgHours).HasPrecision(4, 1);
        builder.Property(s => s.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(s => s.UpdatedBy).HasMaxLength(128);
    }
}

public sealed class PatientObstetricProfileConfiguration : IEntityTypeConfiguration<PatientObstetricProfile>
{
    public void Configure(EntityTypeBuilder<PatientObstetricProfile> builder)
    {
        builder.HasKey(o => o.Id);
        builder.HasIndex(o => o.PatientId).IsUnique();
        builder.Property(o => o.Notes).HasMaxLength(1000);
        builder.Property(o => o.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(o => o.UpdatedBy).HasMaxLength(128);
    }
}

public sealed class PatientMentalHealthProfileConfiguration : IEntityTypeConfiguration<PatientMentalHealthProfile>
{
    public void Configure(EntityTypeBuilder<PatientMentalHealthProfile> builder)
    {
        builder.HasKey(m => m.Id);
        builder.HasIndex(m => m.PatientId).IsUnique();
        builder.Property(m => m.DiagnosisName).HasMaxLength(300);
        builder.Property(m => m.MedicationName).HasMaxLength(200);
        builder.Property(m => m.TherapistName).HasMaxLength(200);
        builder.Property(m => m.TherapyType).HasMaxLength(100);
        builder.Property(m => m.SessionFrequency).HasMaxLength(100);
        builder.Property(m => m.Notes).HasMaxLength(1000);
        builder.Property(m => m.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(m => m.UpdatedBy).HasMaxLength(128);
    }
}
