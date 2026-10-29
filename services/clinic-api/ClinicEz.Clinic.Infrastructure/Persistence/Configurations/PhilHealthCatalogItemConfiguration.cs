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

public sealed class PhilHealthCatalogItemConfiguration : IEntityTypeConfiguration<PhilHealthCatalogItem>
{
    public void Configure(EntityTypeBuilder<PhilHealthCatalogItem> entity)
    {
            entity.ToTable("PhilHealthCatalogItems");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Library).IsRequired().HasMaxLength(64);
            entity.Property(e => e.ItemKey).IsRequired().HasMaxLength(160);
            entity.Property(e => e.Code).IsRequired().HasMaxLength(128);
            entity.Property(e => e.PhilHealthCode).HasMaxLength(128);
            entity.Property(e => e.RequiresSpecifyText).IsRequired().HasDefaultValue(false);
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.AttributesJson).HasColumnType("text");
            entity.Property(e => e.KitVersion).HasMaxLength(40);
            entity.HasIndex(e => new { e.Library, e.ItemKey }).IsUnique();
            entity.HasIndex(e => new { e.Library, e.Code });
    }
}
