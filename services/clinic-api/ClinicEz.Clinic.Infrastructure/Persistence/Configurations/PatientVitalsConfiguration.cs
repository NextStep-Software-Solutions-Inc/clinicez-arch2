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

public sealed class PatientVitalsConfiguration : IEntityTypeConfiguration<PatientVitals>
{
    public void Configure(EntityTypeBuilder<PatientVitals> entity)
    {
            entity.ToTable("PatientVitals");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TemperatureCelsius).HasPrecision(5, 2);
            entity.Property(e => e.OxygenSaturationPercent).HasPrecision(5, 2);
            entity.Property(e => e.HeightCm).HasPrecision(6, 2);
            entity.Property(e => e.WeightKg).HasPrecision(6, 2);
            entity.Property(e => e.Bmi).HasPrecision(5, 2);
            entity.Property(e => e.BloodGlucoseRandomMgDl).HasPrecision(6, 2);
            entity.Property(e => e.RecordedByNurseName).HasMaxLength(150);
            entity.Property(e => e.VisualAcuityLeft).HasMaxLength(50);
            entity.Property(e => e.VisualAcuityRight).HasMaxLength(50);
            entity.Property(e => e.HeadCircumferenceCm).HasPrecision(6, 2);
            entity.Property(e => e.MidUpperArmCircumferenceCm).HasPrecision(6, 2);
            entity.Property(e => e.ZScoreWeightForAge).HasPrecision(5, 2);
            entity.Property(e => e.ZScoreLengthForAge).HasPrecision(5, 2);
            entity.Property(e => e.ZScoreWeightForLength).HasPrecision(5, 2);
            entity.Property(e => e.WaistCircumferenceCm).HasPrecision(6, 2);
            entity.Property(e => e.HipCircumferenceCm).HasPrecision(6, 2);
            entity.Property(e => e.BodyLengthCm).HasPrecision(6, 2);
            entity.Property(e => e.SkinfoldThicknessMm).HasPrecision(6, 2);
            entity.Property(e => e.LimbsCircumferenceCm).HasPrecision(6, 2);
            entity.Property(e => e.GrowthZScoreCategory).HasMaxLength(50);
            entity.Property(e => e.GrowthZScoreCode).HasMaxLength(50);
            entity.Property(e => e.SamFormCode).HasMaxLength(20);

            entity.HasOne(e => e.Patient)
                .WithMany(p => p.Vitals)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.RecordedAt });
            entity.HasIndex(e => new { e.ClinicId, e.QueueItemId });
    }
}
