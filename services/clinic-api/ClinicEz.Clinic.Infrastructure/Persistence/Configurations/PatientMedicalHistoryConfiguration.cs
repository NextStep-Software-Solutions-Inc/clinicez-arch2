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

public sealed class PatientMedicalHistoryConfiguration : IEntityTypeConfiguration<PatientMedicalHistory>
{
    public void Configure(EntityTypeBuilder<PatientMedicalHistory> entity)
    {
            entity.ToTable("PatientMedicalHistories");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Category).IsRequired().HasMaxLength(50);
            entity.Property(e => e.VerificationStatus).IsRequired().HasMaxLength(50);
            entity.Property(e => e.ConditionTitle).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Icd10Code).HasMaxLength(50);
            entity.Property(e => e.SnomedCode).HasMaxLength(50);
            entity.Property(e => e.PhilHealthMdiseaseCode).HasMaxLength(50);
            entity.Property(e => e.SpecificDescription).HasMaxLength(500);
            entity.Property(e => e.Status).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Severity).HasMaxLength(50);
            entity.Property(e => e.ClinicalNotes).HasMaxLength(1000);
            entity.Property(e => e.RecordedByStaffName).HasMaxLength(150);
            entity.Property(e => e.IsOnDialysis);
            entity.Property(e => e.DialysisType).HasMaxLength(50);
            entity.Property(e => e.DialysisYearStarted);

            entity.HasOne(e => e.ConsultationEncounter)
                .WithMany()
                .HasForeignKey(e => e.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.Status });
            entity.HasIndex(e => new { e.ClinicId, e.Icd10Code });
            entity.HasIndex(e => new { e.ClinicId, e.PhilHealthMdiseaseCode });
    }
}
