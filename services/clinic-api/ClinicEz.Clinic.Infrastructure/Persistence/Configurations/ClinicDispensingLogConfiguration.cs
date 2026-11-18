using ClinicEz.Clinic.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicEz.Clinic.Infrastructure.Persistence.Configurations;

public sealed class ClinicDispensingLogConfiguration : IEntityTypeConfiguration<ClinicDispensingLog>
{
    public void Configure(EntityTypeBuilder<ClinicDispensingLog> entity)
    {
        entity.ToTable("ClinicDispensingLogs");
        entity.HasKey(e => e.Id);

        entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
        entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
        entity.Property(e => e.ItemName).IsRequired().HasMaxLength(200);
        entity.Property(e => e.DosageOrSpec).HasMaxLength(100);
        entity.Property(e => e.FormOrUnit).IsRequired().HasMaxLength(50);
        entity.Property(e => e.DirectionsOrInstructions).HasMaxLength(500);
        entity.Property(e => e.DispensedByStaffName).IsRequired().HasMaxLength(150);
        entity.Property(e => e.DispensedByRole).IsRequired().HasMaxLength(50);
        entity.Property(e => e.ReviewedByDoctorName).HasMaxLength(150);
        entity.Property(e => e.DoctorReviewNotes).HasMaxLength(1000);

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
            .OnDelete(DeleteBehavior.Cascade);

        entity.HasOne(e => e.PrescriptionItem)
            .WithMany()
            .HasForeignKey(e => e.PrescriptionItemId)
            .OnDelete(DeleteBehavior.SetNull);

        entity.HasOne(e => e.PatientVitals)
            .WithMany()
            .HasForeignKey(e => e.PatientVitalsId)
            .OnDelete(DeleteBehavior.SetNull);

        entity.HasIndex(e => new { e.ClinicId, e.DispensedAt });
        entity.HasIndex(e => new { e.ClinicId, e.QueueItemId });
        entity.HasIndex(e => new { e.ClinicId, e.ConsultationEncounterId });
        entity.HasIndex(e => new { e.ClinicId, e.RequiresDoctorReview, e.ReviewedAt });
    }
}
