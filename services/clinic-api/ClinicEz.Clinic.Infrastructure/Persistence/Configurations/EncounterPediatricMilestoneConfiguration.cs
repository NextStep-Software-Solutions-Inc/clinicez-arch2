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

public sealed class EncounterPediatricMilestoneConfiguration : IEntityTypeConfiguration<EncounterPediatricMilestone>
{
    public void Configure(EntityTypeBuilder<EncounterPediatricMilestone> entity)
    {
            entity.ToTable("EncounterPediatricMilestones");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ConsultationEncounterId).IsRequired();
            entity.Property(e => e.MilestoneVisitAgeCode).IsRequired().HasMaxLength(20);
            entity.Property(e => e.GrossMotorRemarks).HasMaxLength(500);
            entity.Property(e => e.FineMotorRemarks).HasMaxLength(500);
            entity.Property(e => e.LanguageRemarks).HasMaxLength(500);
            entity.Property(e => e.CognitiveRemarks).HasMaxLength(500);
            entity.Property(e => e.PsychosocialRemarks).HasMaxLength(500);

            entity.HasOne(e => e.ConsultationEncounter)
                .WithMany(c => c.PediatricMilestones)
                .HasForeignKey(e => e.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.ConsultationEncounterId });
    }
}
