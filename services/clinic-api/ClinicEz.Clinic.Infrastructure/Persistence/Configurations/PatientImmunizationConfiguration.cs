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

public sealed class PatientImmunizationConfiguration : IEntityTypeConfiguration<PatientImmunization>
{
    public void Configure(EntityTypeBuilder<PatientImmunization> entity)
    {
            entity.ToTable("PatientImmunizations");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.VaccineCode).HasMaxLength(50);
            entity.Property(e => e.PhilHealthLibrary).HasMaxLength(50);
            entity.Property(e => e.PhilHealthCode).HasMaxLength(20);
            entity.Property(e => e.PhilHealthVaccinationStatusCode).HasMaxLength(20);
            entity.Property(e => e.VaccineName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.BrandName).HasMaxLength(150);
            entity.Property(e => e.Manufacturer).HasMaxLength(150);
            entity.Property(e => e.LotBatchNumber).HasMaxLength(100);
            entity.Property(e => e.Route).HasMaxLength(50);
            entity.Property(e => e.InjectionSite).HasMaxLength(100);
            entity.Property(e => e.AdministeredByStaffName).HasMaxLength(150);
            entity.Property(e => e.AdministeredByPrcLicense).HasMaxLength(50);
            entity.Property(e => e.AdverseReactionSeverity).IsRequired().HasMaxLength(50).HasDefaultValue("None");
            entity.Property(e => e.AdverseReactionRemarks).HasMaxLength(1000);
            entity.Property(e => e.HistoricalFacilityName).HasMaxLength(150);
            entity.Property(e => e.Remarks).HasMaxLength(1000);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.AdministeredAtUtc });
            entity.HasIndex(e => new { e.LotBatchNumber, e.ExpirationDate });
    }
}
