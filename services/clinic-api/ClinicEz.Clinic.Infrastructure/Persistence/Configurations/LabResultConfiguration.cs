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

public sealed class LabResultConfiguration : IEntityTypeConfiguration<LabResult>
{
    public void Configure(EntityTypeBuilder<LabResult> entity)
    {
            entity.ToTable("LabResults");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ExternalLabName).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.FileName).HasMaxLength(255);
            entity.Property(e => e.ContentType).HasMaxLength(100);
            entity.Property(e => e.StorageKey).HasMaxLength(400);
            entity.Property(e => e.EncryptionIvBase64).HasMaxLength(100);
            entity.Property(e => e.EncryptionTagBase64).HasMaxLength(100);
            entity.Property(e => e.EncryptedHash).HasMaxLength(100);
            entity.Property(e => e.WrappedKeyJson).HasColumnType("text");
            entity.Property(e => e.VerifiedByName).HasMaxLength(150);
            entity.Property(e => e.VerifiedByPrc).HasMaxLength(50);
            entity.Property(e => e.ReviewRemarks).HasMaxLength(1000);

            entity.HasOne<LabOrder>()
                .WithMany()
                .HasForeignKey(e => e.LabOrderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.ClinicId, e.LabOrderId });
            entity.HasIndex(e => new { e.ClinicId, e.Verification, e.SubmittedAt });
            entity.HasIndex(e => new { e.ClinicId, e.LabOrderId, e.ReportId })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false AND \"ReportId\" IS NOT NULL");
    }
}
