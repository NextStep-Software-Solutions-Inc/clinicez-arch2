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

public sealed class DentalToothRecordConfiguration : IEntityTypeConfiguration<DentalToothRecord>
{
    public void Configure(EntityTypeBuilder<DentalToothRecord> entity)
    {
            entity.ToTable("DentalToothRecords");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientName).HasMaxLength(150);
            entity.Property(e => e.ToothNumber).IsRequired();
            entity.Property(e => e.Status)
                .IsRequired()
                .HasConversion<string>()
                .HasMaxLength(50);
            entity.Property(e => e.Surface).HasMaxLength(20);
            entity.Property(e => e.ActiveSurface).HasMaxLength(20);
            entity.Property(e => e.IsCurrent).IsRequired().HasDefaultValue(true);
            entity.Property(e => e.RecordedBy).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(1000);
            entity.Property(e => e.IsVoided).IsRequired().HasDefaultValue(false);
            entity.Property(e => e.VoidedBy).HasMaxLength(200);
            entity.Property(e => e.VoidReason).HasMaxLength(500);

            entity.HasOne(e => e.Patient)
                .WithMany(p => p.DentalToothRecords)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.ToothNumber });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.ToothNumber, e.IsCurrent });
            entity.HasIndex(e => new { e.ClinicId, e.ConsultationId });
    }
}
