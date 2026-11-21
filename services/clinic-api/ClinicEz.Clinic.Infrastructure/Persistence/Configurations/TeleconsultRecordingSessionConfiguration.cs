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

public sealed class TeleconsultRecordingSessionConfiguration : IEntityTypeConfiguration<TeleconsultRecordingSession>
{
    public void Configure(EntityTypeBuilder<TeleconsultRecordingSession> entity)
    {
            entity.ToTable("TeleconsultRecordingSessions");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.ClinicId, e.CallId })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.ConsultationId });
            entity.HasIndex(e => e.ExpiresAtUtc)
                  .HasFilter("\"IsPurged\" = false AND \"IsLegalHold\" = false");

            entity.Property(e => e.TenantId).HasMaxLength(64).IsRequired();
            entity.Property(e => e.DoctorName).HasMaxLength(128).IsRequired();
            entity.Property(e => e.PatientName).HasMaxLength(128).IsRequired();
            entity.Property(e => e.ConsentStatus).HasMaxLength(32).IsRequired();
            entity.Property(e => e.RecordingState).HasMaxLength(32).IsRequired();
            entity.Property(e => e.StoragePolicy).HasMaxLength(32).IsRequired();
            entity.Property(e => e.ContainerFormat).HasMaxLength(64).IsRequired();
            entity.Property(e => e.ManifestStorageKey).HasMaxLength(512);
            entity.Property(e => e.EncryptionAlgorithm).HasMaxLength(32).IsRequired();
            entity.Property(e => e.EncryptionKeyId).HasMaxLength(64).IsRequired();
            entity.Property(e => e.LegalHoldReason).HasMaxLength(512);
            entity.Property(e => e.LegalHoldPlacedByStaffName).HasMaxLength(128);
            entity.Property(e => e.PurgedBy).HasMaxLength(128);

            entity.HasOne(e => e.Patient)
                .WithMany()
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(e => e.Segments)
                  .WithOne(s => s.Session)
                  .HasForeignKey(s => s.SessionId)
                  .OnDelete(DeleteBehavior.Cascade);
    }
}
