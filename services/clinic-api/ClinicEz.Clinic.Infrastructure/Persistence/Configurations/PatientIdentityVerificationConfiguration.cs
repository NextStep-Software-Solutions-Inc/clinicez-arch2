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

public sealed class PatientIdentityVerificationConfiguration : IEntityTypeConfiguration<PatientIdentityVerification>
{
    public void Configure(EntityTypeBuilder<PatientIdentityVerification> entity)
    {
            entity.ToTable("PatientIdentityVerifications");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientId).IsRequired();
            entity.Property(e => e.Mode).IsRequired().HasConversion<string>().HasMaxLength(30);
            entity.Property(e => e.VerificationDate).IsRequired();
            entity.Property(e => e.PcuTransactionId).HasMaxLength(50);
            entity.Property(e => e.OneTimePin).HasMaxLength(20);
            entity.Property(e => e.ValidIdTypeCode).HasMaxLength(20);
            entity.Property(e => e.ValidIdNumber).HasMaxLength(100);
            entity.Property(e => e.FirstUploadedOnDate).IsRequired().HasDefaultValue(false);

            entity.HasOne(e => e.Patient)
                .WithMany(p => p.IdentityVerifications)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.VerificationDate });
    }
}
