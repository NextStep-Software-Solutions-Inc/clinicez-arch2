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

public sealed class NcdRiskAssessmentConfiguration : IEntityTypeConfiguration<NcdRiskAssessment>
{
    public void Configure(EntityTypeBuilder<NcdRiskAssessment> entity)
    {
            entity.ToTable("NcdRiskAssessments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.DiagnosedDiabetes).HasMaxLength(10);
            entity.Property(e => e.DiabetesMedicationStatus).HasMaxLength(10);
            entity.Property(e => e.FastingBloodSugarMgDl).HasPrecision(6, 2);
            entity.Property(e => e.FastingBloodSugarMmolL).HasPrecision(6, 2);
            entity.Property(e => e.TotalCholesterolMgDl).HasPrecision(6, 2);
            entity.Property(e => e.UrineKetonesValue).HasMaxLength(50);
            entity.Property(e => e.UrineProteinValue).HasMaxLength(50);
            entity.Property(e => e.HighSaltIntake);
            entity.Property(e => e.CvdRiskLevelCode).HasMaxLength(20);
            entity.Property(e => e.RiskBand).IsRequired().HasMaxLength(50).HasDefaultValue("BandA");
            entity.Property(e => e.CalculatedRiskScorePercent).HasPrecision(5, 2);
            entity.Property(e => e.AssessedByStaffName).HasMaxLength(150);
            entity.Property(e => e.Remarks).HasMaxLength(1000);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.AssessmentDate });
    }
}
