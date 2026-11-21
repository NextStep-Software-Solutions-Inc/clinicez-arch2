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

public sealed class PhilHealthDailySequenceConfiguration : IEntityTypeConfiguration<PhilHealthDailySequence>
{
    public void Configure(EntityTypeBuilder<PhilHealthDailySequence> entity)
    {
            entity.ToTable("PhilHealthDailySequences");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.AccreditationNo).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Prefix).IsRequired().HasMaxLength(10);
            entity.Property(e => e.ManilaDate).IsRequired();
            entity.Property(e => e.LastValue).IsRequired();
            entity.HasIndex(e => new { e.ClinicId, e.AccreditationNo, e.Prefix, e.ManilaDate })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
    }
}
