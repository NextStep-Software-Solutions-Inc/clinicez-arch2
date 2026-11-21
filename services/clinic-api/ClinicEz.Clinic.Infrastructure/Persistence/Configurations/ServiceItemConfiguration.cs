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

public sealed class ServiceItemConfiguration : IEntityTypeConfiguration<ServiceItem>
{
    public void Configure(EntityTypeBuilder<ServiceItem> entity)
    {
            entity.ToTable("ServiceItems");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Code).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Category).IsRequired().HasMaxLength(50);
            entity.Property(e => e.StandardPrice).HasPrecision(18, 2);
            entity.Property(e => e.PhilHealthCode).HasMaxLength(50);
            entity.Property(e => e.PhilHealthDescription).HasMaxLength(255);
            entity.Property(e => e.IsPhilHealthFormulary).HasDefaultValue(false);
            entity.Property(e => e.IsNurseOrderable).HasDefaultValue(false);
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.Code })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
    }
}
