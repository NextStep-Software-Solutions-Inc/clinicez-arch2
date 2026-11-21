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

public sealed class AuditEntryConfiguration : IEntityTypeConfiguration<AuditEntry>
{
    public void Configure(EntityTypeBuilder<AuditEntry> entity)
    {
            entity.ToTable("AuditEntries");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Category).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Severity).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Action).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ActorName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.ActorRole).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ClientIpAddress).HasMaxLength(50);
            entity.Property(e => e.UserAgent).HasMaxLength(500);
            entity.Property(e => e.TargetEntityType).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TargetEntityId).HasMaxLength(100);
            entity.Property(e => e.PatientNameMasked).HasMaxLength(150);
            entity.Property(e => e.PatientPinMasked).HasMaxLength(50);
            entity.Property(e => e.Outcome).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Description).IsRequired().HasMaxLength(1000);
            entity.Property(e => e.MetadataJson).HasColumnType("text");

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.Timestamp });
            entity.HasIndex(e => new { e.ClinicId, e.Category, e.Timestamp });
            entity.HasIndex(e => new { e.ClinicId, e.Severity, e.Timestamp });
            entity.HasIndex(e => new { e.ClinicId, e.ActorStaffId, e.Timestamp });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.Timestamp });
            entity.HasIndex(e => new { e.ClinicId, e.TargetEntityType, e.TargetEntityId });
    }
}
