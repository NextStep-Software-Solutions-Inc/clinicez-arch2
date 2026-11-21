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

public sealed class ShareImportConfiguration : IEntityTypeConfiguration<ShareImport>
{
    public void Configure(EntityTypeBuilder<ShareImport> entity)
    {
            entity.ToTable("ShareImports");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Purpose).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ChiefComplaint).HasMaxLength(255);
            entity.Property(e => e.DenialReason).HasMaxLength(500);
            entity.Property(e => e.PatientName).HasMaxLength(200);
            entity.Property(e => e.ClinicEzId).HasMaxLength(40);
            entity.Property(e => e.QueueNumber).HasMaxLength(20);
            entity.Property(e => e.ItemsJson).HasColumnType("text");
            entity.Property(e => e.Scopes).HasMaxLength(200);

            entity.HasOne(e => e.Patient)
                .WithMany()
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.ClinicId, e.RequestedAt });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
    }
}
