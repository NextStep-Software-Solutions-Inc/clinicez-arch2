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

public sealed class EncounterReviewOfSystemsItemConfiguration : IEntityTypeConfiguration<EncounterReviewOfSystemsItem>
{
    public void Configure(EntityTypeBuilder<EncounterReviewOfSystemsItem> entity)
    {
            entity.ToTable("EncounterReviewOfSystemsItems");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ConsultationEncounterId).IsRequired();
            entity.Property(e => e.System).IsRequired().HasConversion<string>().HasMaxLength(50);
            entity.Property(e => e.SymptomCode).IsRequired().HasMaxLength(20);
            entity.Property(e => e.SymptomTitle).HasMaxLength(255);
            entity.Property(e => e.IsNormal).IsRequired().HasDefaultValue(true);
            entity.Property(e => e.Remarks).HasMaxLength(500);

            entity.HasOne(e => e.ConsultationEncounter)
                .WithMany(c => c.ReviewOfSystemsItems)
                .HasForeignKey(e => e.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.ConsultationEncounterId });
    }
}
