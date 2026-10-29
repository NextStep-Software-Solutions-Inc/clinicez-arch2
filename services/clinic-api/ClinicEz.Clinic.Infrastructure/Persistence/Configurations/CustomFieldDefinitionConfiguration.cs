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

public sealed class CustomFieldDefinitionConfiguration : IEntityTypeConfiguration<CustomFieldDefinition>
{
    public void Configure(EntityTypeBuilder<CustomFieldDefinition> entity)
    {
            entity.ToTable("CustomFieldDefinitions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.EntityType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.FieldKey).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Label).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Category).HasMaxLength(50);
            entity.Property(e => e.BoundaryMode).HasMaxLength(50);
            entity.Property(e => e.Placeholder).HasMaxLength(200);
            entity.Property(e => e.OptionsJson).HasColumnType("text");
            entity.Property(e => e.VisibilityRuleJson).HasColumnType("text");
            entity.Property(e => e.ConditionalOptionsJson).HasColumnType("text");
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.EntityType, e.FieldKey })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
    }
}
