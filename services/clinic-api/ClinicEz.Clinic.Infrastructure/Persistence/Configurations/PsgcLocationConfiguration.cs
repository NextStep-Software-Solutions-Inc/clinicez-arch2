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

public sealed class PsgcLocationConfiguration : IEntityTypeConfiguration<PsgcLocation>
{
    public void Configure(EntityTypeBuilder<PsgcLocation> entity)
    {
            entity.ToTable("PsgcLocations");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PsgcCode).IsRequired().HasMaxLength(10);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
            entity.Property(e => e.ParentPsgcCode).HasMaxLength(10);
            entity.Property(e => e.RegionPsgc).HasMaxLength(10);
            entity.Property(e => e.ProvincePsgc).HasMaxLength(10);
            entity.Property(e => e.CityMunicipalityPsgc).HasMaxLength(10);
            entity.Property(e => e.ZipCode).HasMaxLength(10);
            entity.HasIndex(e => e.PsgcCode).IsUnique();
            entity.HasIndex(e => new { e.Level, e.ParentPsgcCode });
            entity.HasIndex(e => e.Name);
    }
}
