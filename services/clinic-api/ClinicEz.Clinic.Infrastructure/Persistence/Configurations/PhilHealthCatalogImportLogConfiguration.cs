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

public sealed class PhilHealthCatalogImportLogConfiguration : IEntityTypeConfiguration<PhilHealthCatalogImportLog>
{
    public void Configure(EntityTypeBuilder<PhilHealthCatalogImportLog> entity)
    {
            entity.ToTable("PhilHealthCatalogImportLogs");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Library).IsRequired().HasMaxLength(64);
            entity.Property(e => e.KitVersion).HasMaxLength(40);
            entity.Property(e => e.ContentHash).HasMaxLength(64);
            entity.Property(e => e.Message).HasMaxLength(500);
            entity.HasIndex(e => new { e.Library, e.CreatedAt });
    }
}
