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

public sealed class PatientSocialHistoryConfiguration : IEntityTypeConfiguration<PatientSocialHistory>
{
    public void Configure(EntityTypeBuilder<PatientSocialHistory> entity)
    {
            entity.ToTable("PatientSocialHistories");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.SmokingStatus).HasMaxLength(50);
            entity.Property(e => e.PacksPerDay).HasPrecision(5, 2);
            entity.Property(e => e.SmokingPackYears).HasPrecision(5, 2);
            entity.Property(e => e.AlcoholStatus).HasMaxLength(50);
            entity.Property(e => e.AlcoholFrequency).HasMaxLength(50);
            entity.Property(e => e.SubstanceUseHistory).HasMaxLength(500);
            entity.Property(e => e.DrugTypes).HasMaxLength(255);
            entity.Property(e => e.PhysicalActivityFrequency).HasMaxLength(100);
            entity.Property(e => e.DietaryHabits).HasMaxLength(255);
            entity.Property(e => e.Occupation).HasMaxLength(150);
            entity.Property(e => e.LivingArrangement).HasMaxLength(100);
            entity.Property(e => e.EducationLevel).HasMaxLength(100);
            entity.Property(e => e.SecondhandSmokeExposureCode).HasMaxLength(10);
            entity.Property(e => e.SmokingFreqCode).HasMaxLength(10);
            entity.Property(e => e.AlcoholDrinkerSubtypeCode).HasMaxLength(10);
            entity.Property(e => e.AlcoholFreqCode).HasMaxLength(10);
            entity.Property(e => e.IllicitDrugUseCode).HasMaxLength(10);
            entity.Property(e => e.SexuallyActiveCode).HasMaxLength(10);
            entity.Property(e => e.PartnersGenderCode).HasMaxLength(10);
            entity.Property(e => e.DietaryIntakeCode).HasMaxLength(10);
            entity.Property(e => e.PhysicalActivityCode).HasMaxLength(10);
            entity.Property(e => e.WaterSourceCode).HasMaxLength(10);
            entity.Property(e => e.ToiletFacilityCode).HasMaxLength(10);
            entity.Property(e => e.Remarks).HasMaxLength(1000);

            entity.HasOne(e => e.Patient)
                .WithOne(p => p.SocialHistory)
                .HasForeignKey<PatientSocialHistory>(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.ClinicId, e.PatientId })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
    }
}
