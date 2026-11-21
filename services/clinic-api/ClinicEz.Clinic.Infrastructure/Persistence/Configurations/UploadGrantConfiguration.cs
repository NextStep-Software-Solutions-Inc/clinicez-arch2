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

public sealed class UploadGrantConfiguration : IEntityTypeConfiguration<UploadGrant>
{
    public void Configure(EntityTypeBuilder<UploadGrant> entity)
    {
            entity.ToTable("UploadGrants");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TokenHash).IsRequired().HasMaxLength(32);

            entity.HasOne<LabOrder>()
                .WithMany()
                .HasForeignKey(e => e.LabOrderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.TokenHash)
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
            entity.HasIndex(e => new { e.ClinicId, e.LabOrderId });
    }
}
