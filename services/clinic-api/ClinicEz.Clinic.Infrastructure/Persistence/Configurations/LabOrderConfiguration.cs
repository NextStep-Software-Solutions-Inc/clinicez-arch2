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

public sealed class LabOrderConfiguration : IEntityTypeConfiguration<LabOrder>
{
    public void Configure(EntityTypeBuilder<LabOrder> entity)
    {
            entity.ToTable("LabOrders");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.OrderNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.StageReason).HasMaxLength(500);
            entity.Property(e => e.QuotedAmount).HasPrecision(18, 2);
            entity.Property(e => e.QuotedCurrency).HasMaxLength(10);
            entity.Property(e => e.TargetTenantId).HasMaxLength(100);
            entity.Property(e => e.LaboratoryTenantId).HasMaxLength(100);
            entity.Property(e => e.LaboratoryFacilityId).HasMaxLength(100);
            entity.Property(e => e.LaboratoryName).HasMaxLength(200);
            entity.Property(e => e.ClaimToken).HasMaxLength(200);
            entity.Property(e => e.PhilHealthRequestTransNo).HasMaxLength(23);
            entity.Property(e => e.RequestingPhysicianPan).HasMaxLength(50);
            entity.Property(e => e.RequestingPhysicianPrcNo).HasMaxLength(50);
            entity.Property(e => e.RequestingPhysicianName).HasMaxLength(150);

            entity.HasOne(e => e.Patient)
                .WithMany()
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(e => e.Items)
                .WithOne(i => i.LabOrder)
                .HasForeignKey(i => i.LabOrderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(e => e.Observations)
                .WithOne(o => o.LabOrder)
                .HasForeignKey(o => o.LabOrderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.OrderNumber })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.OrderDate });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
    }
}
