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

public sealed class RecordAttachmentConfiguration : IEntityTypeConfiguration<RecordAttachment>
{
    public void Configure(EntityTypeBuilder<RecordAttachment> entity)
    {
            entity.ToTable("RecordAttachments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.RecordType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(200);
            entity.Property(e => e.FileName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.ContentType).HasMaxLength(100);
            entity.Property(e => e.VerificationStatus).HasMaxLength(50).HasDefaultValue("Verified");
            entity.Property(e => e.RejectionReason).HasMaxLength(255);
            entity.Property(e => e.VerifiedByStaffName).HasMaxLength(150);
            entity.Property(e => e.EncryptionAlgorithm).HasMaxLength(50).HasDefaultValue("AES-256-GCM");
            entity.Property(e => e.EncryptionKeyId).HasMaxLength(100);
            entity.Property(e => e.EncryptionIvBase64).HasMaxLength(100);
            entity.Property(e => e.EncryptionTagBase64).HasMaxLength(100);
            entity.Property(e => e.EncryptedHash).HasMaxLength(100);
            entity.Property(e => e.WrappedKeyJson).HasColumnType("text");

            entity.HasOne(e => e.Patient)
                .WithMany()
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
    }
}
