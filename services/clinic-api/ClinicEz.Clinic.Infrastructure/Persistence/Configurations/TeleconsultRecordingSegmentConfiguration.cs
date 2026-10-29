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

public sealed class TeleconsultRecordingSegmentConfiguration : IEntityTypeConfiguration<TeleconsultRecordingSegment>
{
    public void Configure(EntityTypeBuilder<TeleconsultRecordingSegment> entity)
    {
            entity.ToTable("TeleconsultRecordingSegments");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.SessionId, e.SegmentIndex })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");

            entity.Property(e => e.TenantId).HasMaxLength(64).IsRequired();
            entity.Property(e => e.StorageKey).HasMaxLength(512).IsRequired();
            entity.Property(e => e.Sha256Checksum).HasMaxLength(64).IsRequired();
            entity.Property(e => e.IvBase64).HasMaxLength(64).IsRequired();
            entity.Property(e => e.TagBase64).HasMaxLength(64).IsRequired();
            entity.HasIndex(e => new { e.ClinicId, e.SessionId });
    }
}
