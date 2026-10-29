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

public sealed class EncounterPediatricDangerSignConfiguration : IEntityTypeConfiguration<EncounterPediatricDangerSign>
{
    public void Configure(EntityTypeBuilder<EncounterPediatricDangerSign> entity)
    {
            entity.ToTable("EncounterPediatricDangerSigns");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PediatricMilestoneId).IsRequired();
            entity.Property(e => e.Domain).IsRequired().HasMaxLength(10);
            entity.Property(e => e.DangerSignCode).IsRequired().HasMaxLength(20);
            entity.Property(e => e.Description).HasMaxLength(255);
            entity.Property(e => e.IsPresent).IsRequired().HasDefaultValue(true);
            entity.Property(e => e.Remarks).HasMaxLength(500);

            entity.HasOne(e => e.PediatricMilestone)
                .WithMany(m => m.DangerSigns)
                .HasForeignKey(e => e.PediatricMilestoneId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.PediatricMilestoneId });
    }
}
