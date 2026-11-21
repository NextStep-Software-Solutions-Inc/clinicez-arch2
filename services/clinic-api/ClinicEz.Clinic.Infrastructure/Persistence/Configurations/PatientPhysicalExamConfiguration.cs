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

public sealed class PatientPhysicalExamConfiguration : IEntityTypeConfiguration<PatientPhysicalExam>
{
    public void Configure(EntityTypeBuilder<PatientPhysicalExam> entity)
    {
            entity.ToTable("PatientPhysicalExams");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ExaminedByStaffName).HasMaxLength(150);
            entity.Property(e => e.GeneralSurveyStatus).IsRequired().HasMaxLength(50);
            entity.Property(e => e.GeneralSurveyRemarks).HasMaxLength(1000);
            entity.Property(e => e.GeneralSurveyCodes).HasMaxLength(100);
            entity.Property(e => e.CbeRemarks).HasMaxLength(1000);
            entity.Property(e => e.SkinRemarks).HasMaxLength(1000);
            entity.Property(e => e.HeentRemarks).HasMaxLength(1000);
            entity.Property(e => e.ChestLungsRemarks).HasMaxLength(1000);
            entity.Property(e => e.HeartRemarks).HasMaxLength(1000);
            entity.Property(e => e.AbdomenRemarks).HasMaxLength(1000);
            entity.Property(e => e.GenitourinaryRemarks).HasMaxLength(1000);
            entity.Property(e => e.DigitalRectalRemarks).HasMaxLength(1000);
            entity.Property(e => e.NeurologicalRemarks).HasMaxLength(1000);
            entity.Property(e => e.MusculoskeletalRemarks).HasMaxLength(1000);
            entity.Property(e => e.PsychiatricRemarks).HasMaxLength(1000);
            entity.Property(e => e.LymphaticRemarks).HasMaxLength(1000);
            entity.Property(e => e.GenSurveyId).HasMaxLength(50);
            entity.Property(e => e.SkinId).HasMaxLength(50);
            entity.Property(e => e.HeentId).HasMaxLength(50);
            entity.Property(e => e.ChestId).HasMaxLength(50);
            entity.Property(e => e.HeartId).HasMaxLength(50);
            entity.Property(e => e.AbdomenId).HasMaxLength(50);
            entity.Property(e => e.NeuroId).HasMaxLength(50);
            entity.Property(e => e.RectalId).HasMaxLength(50);
            entity.Property(e => e.GuId).HasMaxLength(50);

            entity.HasOne(e => e.ConsultationEncounter)
                .WithMany(c => c.PhysicalExams)
                .HasForeignKey(e => e.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasMany(e => e.Findings)
                .WithOne(f => f.PhysicalExam)
                .HasForeignKey(f => f.PhysicalExamId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.ExamDate });
            entity.HasIndex(e => new { e.ClinicId, e.ConsultationEncounterId });
    }
}
