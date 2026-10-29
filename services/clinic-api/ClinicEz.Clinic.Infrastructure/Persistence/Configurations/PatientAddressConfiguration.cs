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

public sealed class PatientAddressConfiguration : IEntityTypeConfiguration<PatientAddress>
{
    public void Configure(EntityTypeBuilder<PatientAddress> entity)
    {
            entity.ToTable("PatientAddresses");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientId).IsRequired();
            entity.Property(e => e.AddressType).IsRequired().HasConversion<string>().HasMaxLength(30);
            entity.Property(e => e.IsSameAsPermanent).IsRequired().HasDefaultValue(false);
            entity.Property(e => e.RegionPsgc).HasMaxLength(10);
            entity.Property(e => e.ProvincePsgc).HasMaxLength(10);
            entity.Property(e => e.CityMunicipalityPsgc).HasMaxLength(10);
            entity.Property(e => e.BarangayPsgc).HasMaxLength(10);
            entity.Property(e => e.ZipCode).HasMaxLength(10);
            entity.Property(e => e.StreetAddress).HasMaxLength(500);

            entity.HasOne(e => e.Patient)
                .WithMany(p => p.Addresses)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.AddressType })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
    }
}
