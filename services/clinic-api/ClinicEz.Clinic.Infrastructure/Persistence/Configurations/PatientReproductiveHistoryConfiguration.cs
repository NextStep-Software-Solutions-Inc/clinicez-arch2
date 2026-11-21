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

public sealed class PatientReproductiveHistoryConfiguration : IEntityTypeConfiguration<PatientReproductiveHistory>
{
    public void Configure(EntityTypeBuilder<PatientReproductiveHistory> entity)
    {
            entity.ToTable("PatientReproductiveHistories");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ContraceptiveMethod).HasMaxLength(100);
            entity.Property(e => e.DeliveryType).HasMaxLength(50);
            entity.Property(e => e.MenarcheAge);
            entity.Property(e => e.MenstrualFrequencyCode).HasMaxLength(20);
            entity.Property(e => e.PeriodDurationDays);
            entity.Property(e => e.PadsPerDay);
            entity.Property(e => e.MenopauseAge);
            entity.Property(e => e.LastPapSmearYear);
            entity.Property(e => e.VisualInspectionAceticAcidYear);
            entity.Property(e => e.HpvDnaTestYear);
            entity.Property(e => e.LastMammogramYear);
            entity.Property(e => e.ClinicalBreastExamYear);
            entity.Property(e => e.Gravidity);
            entity.Property(e => e.Parity);
            entity.Property(e => e.TermBirths);
            entity.Property(e => e.PretermBirths);
            entity.Property(e => e.Abortions);
            entity.Property(e => e.LivingChildren);
            entity.Property(e => e.Remarks).HasMaxLength(1000);

            entity.HasOne(e => e.Patient)
                .WithOne(p => p.ReproductiveHistory)
                .HasForeignKey<PatientReproductiveHistory>(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.ClinicId, e.PatientId })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
    }
}
