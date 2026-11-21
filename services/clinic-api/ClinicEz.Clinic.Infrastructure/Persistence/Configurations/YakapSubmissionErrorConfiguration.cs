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

public sealed class YakapSubmissionErrorConfiguration : IEntityTypeConfiguration<YakapSubmissionError>
{
    public void Configure(EntityTypeBuilder<YakapSubmissionError> entity)
    {
            entity.ToTable("YakapSubmissionErrors");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.YakapSubmissionId).IsRequired();
            entity.Property(e => e.FieldPath).IsRequired().HasMaxLength(250);
            entity.Property(e => e.Issue).IsRequired().HasMaxLength(1000);

            entity.HasOne(e => e.YakapSubmission)
                .WithMany(s => s.Errors)
                .HasForeignKey(e => e.YakapSubmissionId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.ClinicId, e.YakapSubmissionId });
    }
}
