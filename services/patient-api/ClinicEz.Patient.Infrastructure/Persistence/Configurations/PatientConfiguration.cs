using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Infrastructure.Persistence.Configurations;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class PatientConfiguration : IEntityTypeConfiguration<Patient>
{
    public void Configure(EntityTypeBuilder<Patient> builder)
    {
        builder.HasKey(p => p.Id);

        builder.Property(p => p.ClerkUserId).HasMaxLength(128);
        builder.HasIndex(p => p.ClerkUserId).IsUnique()
            .HasFilter("clerk_user_id IS NOT NULL");

        builder.Property(p => p.ClinicEzId).HasMaxLength(20).IsRequired();
        builder.HasIndex(p => p.ClinicEzId).IsUnique();

        builder.HasOne(p => p.ManagedByPatient)
            .WithMany(m => m.ManagedDependents)
            .HasForeignKey(p => p.ManagedByPatientId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.Property(p => p.RelationshipToManager).HasMaxLength(50);
        builder.HasIndex(p => p.ManagedByPatientId);

        builder.Property(p => p.FirstName).HasMaxLength(100).IsRequired();
        builder.Property(p => p.MiddleName).HasMaxLength(100);
        builder.Property(p => p.LastName).HasMaxLength(100).IsRequired();
        builder.Property(p => p.Suffix).HasMaxLength(20);
        builder.Property(p => p.Nationality).HasMaxLength(80);
        builder.Property(p => p.Ethnicity).HasMaxLength(80);
        builder.Property(p => p.Religion).HasMaxLength(80);
        builder.Property(p => p.PrimaryLanguage).HasMaxLength(50);
        builder.Property(p => p.AvatarUrl).HasMaxLength(500);
        builder.Property(p => p.Mobile).HasMaxLength(20);
        builder.Property(p => p.AltPhone).HasMaxLength(20);
        builder.Property(p => p.Email).HasMaxLength(254);
        builder.Property(p => p.MessengerHandle).HasMaxLength(100);
        builder.Property(p => p.CreatedBy).HasMaxLength(128).IsRequired();
        builder.Property(p => p.UpdatedBy).HasMaxLength(128);
        builder.Property(p => p.DeletedBy).HasMaxLength(128);

        builder.Property(p => p.Sex).HasConversion<string>().HasMaxLength(20);
        builder.Property(p => p.CivilStatus).HasConversion<string>().HasMaxLength(20);
        builder.Property(p => p.BloodType).HasConversion<string>().HasMaxLength(15);
        builder.Property(p => p.EducationLevel).HasConversion<string>().HasMaxLength(30);

        // One-to-one profiles — dependent FK is on the profile side
        builder.HasOne(p => p.SocialHistory)
            .WithOne(s => s.Patient)
            .HasForeignKey<PatientSocialHistory>(s => s.PatientId);

        builder.HasOne(p => p.ObstetricProfile)
            .WithOne(o => o.Patient)
            .HasForeignKey<PatientObstetricProfile>(o => o.PatientId);

        builder.HasOne(p => p.MentalHealthProfile)
            .WithOne(m => m.Patient)
            .HasForeignKey<PatientMentalHealthProfile>(m => m.PatientId);

        builder.HasOne(p => p.Occupation)
            .WithOne(o => o.Patient)
            .HasForeignKey<PatientOccupation>(o => o.PatientId);

        builder.HasOne(p => p.MaleReproductive)
            .WithOne(m => m.Patient)
            .HasForeignKey<PatientMaleReproductive>(m => m.PatientId);

        builder.HasOne(p => p.DentalVision)
            .WithOne(d => d.Patient)
            .HasForeignKey<PatientDentalVision>(d => d.PatientId);

        builder.HasOne(p => p.NcdQuestionnaire)
            .WithOne(n => n.Patient)
            .HasForeignKey<PatientNcdQuestionnaire>(n => n.PatientId);
    }
}
