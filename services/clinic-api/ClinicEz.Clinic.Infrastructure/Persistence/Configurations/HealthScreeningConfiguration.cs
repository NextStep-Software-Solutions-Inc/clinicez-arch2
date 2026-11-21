using ClinicEz.Clinic.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicEz.Clinic.Infrastructure.Persistence.Configurations;

public sealed class HealthScreeningConfiguration : IEntityTypeConfiguration<HealthScreening>
{
    public void Configure(EntityTypeBuilder<HealthScreening> entity)
    {
        entity.ToTable("HealthScreenings");
        entity.HasKey(e => e.Id);
        entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);

        entity.Property(e => e.ScreeningType).IsRequired().HasConversion<string>().HasMaxLength(50);
        entity.Property(e => e.WorkflowMode).IsRequired().HasConversion<string>().HasMaxLength(50);
        entity.Property(e => e.Status).IsRequired().HasConversion<string>().HasMaxLength(50);
        entity.Property(e => e.Disposition).HasConversion<string>().HasMaxLength(50);
        entity.Property(e => e.ServiceDeliveryMethod).IsRequired().HasConversion<string>().HasMaxLength(30);

        entity.Property(e => e.ScreenedByNurseName).HasMaxLength(150);
        entity.Property(e => e.ExaminedByDoctorName).HasMaxLength(150);

        entity.Property(e => e.NurseScreeningNotes).HasMaxLength(2000);
        entity.Property(e => e.ClinicalImpression).HasMaxLength(2000);
        entity.Property(e => e.PreventiveCounselingNotes).HasMaxLength(2000);

        entity.Property(e => e.AdultsRoutineScreeningCode).HasMaxLength(100);
        entity.Property(e => e.PediatricRoutineScreeningCode).HasMaxLength(100);
        entity.Property(e => e.PrenatalScreeningServicesCode).HasMaxLength(100);
        entity.Property(e => e.BreastCancerScreeningCode).HasMaxLength(50);
        entity.Property(e => e.CervicalCancerScreeningCode).HasMaxLength(50);
        entity.Property(e => e.ColorectalCancerScreeningCode).HasMaxLength(50);
        entity.Property(e => e.ProstateCancerScreeningCode).HasMaxLength(50);

        entity.Property(e => e.PhilHealthAtc).HasMaxLength(50);
        entity.Property(e => e.FpeClassificationType).HasMaxLength(30);
        entity.Property(e => e.ProfilingTransNo).HasMaxLength(50);

        entity.HasOne(e => e.Patient)
            .WithMany()
            .HasForeignKey(e => e.PatientId)
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(e => e.QueueItem)
            .WithMany()
            .HasForeignKey(e => e.QueueItemId)
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(e => e.ConsultationEncounter)
            .WithMany()
            .HasForeignKey(e => e.ConsultationEncounterId)
            .OnDelete(DeleteBehavior.SetNull);

        entity.HasOne(e => e.YakapEnlistment)
            .WithMany()
            .HasForeignKey(e => e.YakapEnlistmentId)
            .OnDelete(DeleteBehavior.SetNull);

        entity.HasOne(e => e.IdentityVerification)
            .WithMany()
            .HasForeignKey(e => e.PatientIdentityVerificationId)
            .OnDelete(DeleteBehavior.SetNull);

        entity.HasOne(e => e.YakapSubmission)
            .WithMany()
            .HasForeignKey(e => e.YakapSubmissionId)
            .OnDelete(DeleteBehavior.SetNull);

        entity.HasOne(e => e.PatientVitals)
            .WithMany()
            .HasForeignKey(e => e.PatientVitalsId)
            .OnDelete(DeleteBehavior.SetNull);

        entity.HasOne(e => e.PatientPhysicalExam)
            .WithMany()
            .HasForeignKey(e => e.PatientPhysicalExamId)
            .OnDelete(DeleteBehavior.SetNull);

        entity.HasOne(e => e.NcdRiskAssessment)
            .WithMany()
            .HasForeignKey(e => e.NcdRiskAssessmentId)
            .OnDelete(DeleteBehavior.SetNull);

        entity.HasOne(e => e.ServiceItem)
            .WithMany()
            .HasForeignKey(e => e.ServiceItemId)
            .OnDelete(DeleteBehavior.SetNull);

        entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.ScreeningDateUtc });
        entity.HasIndex(e => new { e.ClinicId, e.QueueItemId });
        entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
        entity.HasIndex(e => new { e.ClinicId, e.Status });
    }
}
