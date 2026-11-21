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

public sealed class LabObservationConfiguration : IEntityTypeConfiguration<LabObservation>
{
    public void Configure(EntityTypeBuilder<LabObservation> entity)
    {
            entity.ToTable("LabObservations");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.AnalyteCode).IsRequired().HasMaxLength(50);
            entity.Property(e => e.AnalyteName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.LoincCode).HasMaxLength(50);
            entity.Property(e => e.ValueText).IsRequired().HasMaxLength(500);
            entity.Property(e => e.NumericValue).HasPrecision(18, 4);
            entity.Property(e => e.Unit).HasMaxLength(50);
            entity.Property(e => e.ValueConventional).HasPrecision(18, 4);
            entity.Property(e => e.UnitConventional).HasMaxLength(50);
            entity.Property(e => e.QualitativeCode).HasMaxLength(20);
            entity.Property(e => e.ReferenceRangeLow).HasPrecision(18, 4);
            entity.Property(e => e.ReferenceRangeHigh).HasPrecision(18, 4);
            entity.Property(e => e.ReferenceRangeText).HasMaxLength(100);
            entity.Property(e => e.AbnormalFlag).HasMaxLength(20);
            entity.Property(e => e.Method).HasMaxLength(100);
            entity.Property(e => e.PerformedByStaffName).HasMaxLength(150);

            entity.HasIndex(e => new { e.ClinicId, e.LabOrderId });
            entity.HasIndex(e => new { e.ClinicId, e.LabOrderItemId });
            entity.HasIndex(e => new { e.ClinicId, e.AnalyteCode });
    }
}
