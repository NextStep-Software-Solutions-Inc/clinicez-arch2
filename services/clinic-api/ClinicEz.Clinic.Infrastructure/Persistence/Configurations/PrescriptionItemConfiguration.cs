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

public sealed class PrescriptionItemConfiguration : IEntityTypeConfiguration<PrescriptionItem>
{
    public void Configure(EntityTypeBuilder<PrescriptionItem> entity)
    {
            entity.ToTable("Prescriptions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.GenericName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.BrandName).HasMaxLength(150);
            entity.Property(e => e.Dosage).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Form).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Sig).IsRequired().HasMaxLength(255);
            entity.Property(e => e.Route).HasMaxLength(50);
            entity.Property(e => e.DoseUnit).HasMaxLength(50);
            entity.Property(e => e.Frequency).HasMaxLength(50);
            entity.Property(e => e.UnitPrice).HasPrecision(18, 2);
            entity.Property(e => e.PhilHealthCategory).HasMaxLength(50);
            entity.Property(e => e.PhilHealthMedsTransNo).HasMaxLength(23);
            entity.Property(e => e.RouteCode).HasMaxLength(20);
            entity.Property(e => e.FrequencyCode).HasMaxLength(20);
            entity.Property(e => e.InstructionDuration).HasMaxLength(50);
            entity.Property(e => e.SaltCode).HasMaxLength(20);
            entity.Property(e => e.StrengthCode).HasMaxLength(20);
            entity.Property(e => e.FormCode).HasMaxLength(20);
            entity.Property(e => e.UnitCode).HasMaxLength(20);
            entity.Property(e => e.PackageCode).HasMaxLength(20);
            entity.Property(e => e.CategoryCode).HasMaxLength(20);
            entity.Property(e => e.DrugGroupingCode).HasMaxLength(20);
            entity.HasIndex(e => new { e.ClinicId, e.ConsultationEncounterId });
    }
}
