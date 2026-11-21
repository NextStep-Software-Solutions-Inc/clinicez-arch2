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

public sealed class LabOrderItemConfiguration : IEntityTypeConfiguration<LabOrderItem>
{
    public void Configure(EntityTypeBuilder<LabOrderItem> entity)
    {
            entity.ToTable("LabOrderItems");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TestName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.TestCode).HasMaxLength(20);
            entity.Property(e => e.Category).IsRequired().HasMaxLength(50);
            entity.Property(e => e.LoincCode).HasMaxLength(50);
            entity.Property(e => e.PatientComplianceCode).HasMaxLength(50);
            entity.Property(e => e.DiagnosticFee).HasPrecision(18, 2);
            entity.Property(e => e.PhilHealthResultTransNo).HasMaxLength(23);
            entity.Property(e => e.IsDoneOutsideFacility).HasDefaultValue(false);
            entity.Property(e => e.PathologistRadiologistName).HasMaxLength(150);
            entity.Property(e => e.PathologistRadiologistPrcNo).HasMaxLength(50);
            entity.Property(e => e.PathologistPan).HasMaxLength(50);
            entity.HasIndex(e => new { e.ClinicId, e.LabOrderId });
    }
}
