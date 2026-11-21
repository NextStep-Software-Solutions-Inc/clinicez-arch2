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

public sealed class EncounterHeadsssDomainAssessmentConfiguration : IEntityTypeConfiguration<EncounterHeadsssDomainAssessment>
{
    public void Configure(EntityTypeBuilder<EncounterHeadsssDomainAssessment> entity)
    {
            entity.ToTable("EncounterHeadsssDomainAssessments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ConsultationEncounterId).IsRequired();
            entity.Property(e => e.AssentConsentStatus).HasMaxLength(20);
            entity.Property(e => e.Domain).IsRequired().HasMaxLength(30);
            entity.Property(e => e.GuideQuestionCodes).HasMaxLength(200);
            entity.Property(e => e.PatientAnswers).HasMaxLength(2000);
            entity.Property(e => e.RedFlagCodes).HasMaxLength(200);
            entity.Property(e => e.RequiresUrgentReferral).IsRequired().HasDefaultValue(false);

            entity.HasOne(e => e.ConsultationEncounter)
                .WithMany(c => c.HeadsssAssessments)
                .HasForeignKey(e => e.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.ConsultationEncounterId });
    }
}
