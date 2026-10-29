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

public sealed class EncounterAdolescentAssessmentConfiguration : IEntityTypeConfiguration<EncounterAdolescentAssessment>
{
    public void Configure(EntityTypeBuilder<EncounterAdolescentAssessment> entity)
    {
            entity.ToTable("EncounterAdolescentAssessments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ConsultationEncounterId).IsRequired();
            entity.Property(e => e.SmrAssessed).IsRequired();
            entity.Property(e => e.SmrResultCode).HasMaxLength(20);
            entity.Property(e => e.EducationEmploymentCode).HasMaxLength(20);
            entity.Property(e => e.RelationshipStatusCode).HasMaxLength(20);
            entity.Property(e => e.LivingArrangementCode).HasMaxLength(20);
            entity.Property(e => e.LivingArrangementOtherSpec).HasMaxLength(250);
            entity.Property(e => e.ProceedToFullHeadsss).IsRequired().HasDefaultValue(false);

            entity.HasOne(e => e.ConsultationEncounter)
                .WithOne(c => c.AdolescentAssessment)
                .HasForeignKey<EncounterAdolescentAssessment>(e => e.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.ConsultationEncounterId })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
    }
}
