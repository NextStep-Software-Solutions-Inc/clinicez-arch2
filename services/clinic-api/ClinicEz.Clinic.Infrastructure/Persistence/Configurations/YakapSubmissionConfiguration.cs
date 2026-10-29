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

public sealed class YakapSubmissionConfiguration : IEntityTypeConfiguration<YakapSubmission>
{
    public void Configure(EntityTypeBuilder<YakapSubmission> entity)
    {
            entity.ToTable("YakapSubmissions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientId).IsRequired();
            entity.Property(e => e.AccreditationNo).IsRequired().HasMaxLength(9);
            entity.Property(e => e.CaseNo).IsRequired().HasMaxLength(23);
            entity.Property(e => e.SubmissionType).IsRequired().HasConversion<string>().HasMaxLength(40);
            entity.Property(e => e.ReportStatus).IsRequired().HasConversion<string>().HasMaxLength(30);
            entity.Property(e => e.LocalTransactionNo).IsRequired().HasMaxLength(23);
            entity.Property(e => e.UploadTransactionNo).HasMaxLength(23);
            entity.Property(e => e.YesReferenceNo).HasMaxLength(10);
            entity.Property(e => e.ProcessingStatus).IsRequired().HasConversion<string>().HasMaxLength(30);
            entity.Property(e => e.PayloadSha256Hash).HasMaxLength(64);
            entity.Property(e => e.AttemptCount).IsRequired().HasDefaultValue(0);

            entity.HasOne(e => e.Patient)
                .WithMany(p => p.YakapSubmissions)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.PatientYakapEnlistment)
                .WithMany()
                .HasForeignKey(e => e.PatientYakapEnlistmentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.ConsultationEncounter)
                .WithMany()
                .HasForeignKey(e => e.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.UploadTransactionNo });
            entity.HasIndex(e => new { e.ClinicId, e.LocalTransactionNo });
    }
}
