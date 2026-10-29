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

public sealed class PatientHomeMedicationConfiguration : IEntityTypeConfiguration<PatientHomeMedication>
{
    public void Configure(EntityTypeBuilder<PatientHomeMedication> entity)
    {
            entity.ToTable("PatientHomeMedications");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientId).IsRequired();
            entity.Property(e => e.GenericDrugName).IsRequired().HasMaxLength(200);
            entity.Property(e => e.BrandName).HasMaxLength(200);
            entity.Property(e => e.PhilHealthDrugCode).HasMaxLength(50);
            entity.Property(e => e.DoseStrength).HasMaxLength(100);
            entity.Property(e => e.Frequency).HasMaxLength(100);
            entity.Property(e => e.Route).HasMaxLength(50);
            entity.Property(e => e.Duration).HasMaxLength(50);
            entity.Property(e => e.PrescribingPhysicianName).HasMaxLength(150);
            entity.Property(e => e.IsActive).IsRequired().HasDefaultValue(true);
            entity.Property(e => e.IsPndfListed).IsRequired().HasDefaultValue(false);
            entity.Property(e => e.Source).HasMaxLength(50);

            entity.HasOne(e => e.Patient)
                .WithMany(p => p.HomeMedications)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
    }
}
