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

public sealed class EncounterObGyneExamConfiguration : IEntityTypeConfiguration<EncounterObGyneExam>
{
    public void Configure(EntityTypeBuilder<EncounterObGyneExam> entity)
    {
            entity.ToTable("EncounterObGyneExams");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ConsultationEncounterId).IsRequired();
            entity.Property(e => e.FundicHeightCm).HasPrecision(5, 2);
            entity.Property(e => e.LeopoldL1).HasMaxLength(255);
            entity.Property(e => e.LeopoldL2).HasMaxLength(255);
            entity.Property(e => e.LeopoldL3).HasMaxLength(255);
            entity.Property(e => e.LeopoldL4).HasMaxLength(255);
            entity.Property(e => e.PerinealInspection).HasMaxLength(500);
            entity.Property(e => e.SpeculumExam).HasMaxLength(500);
            entity.Property(e => e.InternalExam).HasMaxLength(500);
            entity.Property(e => e.BimanualExam).HasMaxLength(500);
            entity.Property(e => e.RectovaginalExam).HasMaxLength(500);

            entity.HasOne(e => e.ConsultationEncounter)
                .WithOne(c => c.ObGyneExam)
                .HasForeignKey<EncounterObGyneExam>(e => e.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.ConsultationEncounterId })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
    }
}
