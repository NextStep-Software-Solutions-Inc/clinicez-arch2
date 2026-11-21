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

public sealed class PatientInjuryHistoryConfiguration : IEntityTypeConfiguration<PatientInjuryHistory>
{
    public void Configure(EntityTypeBuilder<PatientInjuryHistory> entity)
    {
            entity.ToTable("PatientInjuryHistories");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientId).IsRequired();
            entity.Property(e => e.InjuryDescription).IsRequired().HasMaxLength(2000);
            entity.Property(e => e.MechanismOfInjury).HasMaxLength(255);
            entity.Property(e => e.BodySite).HasMaxLength(100);
            entity.Property(e => e.Icd10ExternalCauseCode).HasMaxLength(20);
            entity.Property(e => e.TreatedAtFacilityName).HasMaxLength(255);
            entity.Property(e => e.ResidualSequelae).HasMaxLength(1000);

            entity.HasOne(e => e.Patient)
                .WithMany(p => p.InjuryHistories)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
    }
}
