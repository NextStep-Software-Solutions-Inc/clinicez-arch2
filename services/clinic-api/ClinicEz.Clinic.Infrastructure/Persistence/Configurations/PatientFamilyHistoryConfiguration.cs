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

public sealed class PatientFamilyHistoryConfiguration : IEntityTypeConfiguration<PatientFamilyHistory>
{
    public void Configure(EntityTypeBuilder<PatientFamilyHistory> entity)
    {
            entity.ToTable("PatientFamilyHistories");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ConditionTitle).IsRequired().HasMaxLength(255);
            entity.Property(e => e.ConditionCategoryCode).HasMaxLength(20);
            entity.Property(e => e.PhilHealthMdiseaseCode).HasMaxLength(50);
            entity.Property(e => e.Icd10Code).HasMaxLength(50);
            entity.Property(e => e.SpecificDescription).HasMaxLength(500);
            entity.Property(e => e.Relationship).HasMaxLength(100);
            entity.Property(e => e.FbsMgDl).HasPrecision(6, 2);
            entity.Property(e => e.FbsMmolL).HasPrecision(6, 2);
            entity.Property(e => e.RbsMgDl).HasPrecision(6, 2);
            entity.Property(e => e.RbsMmolL).HasPrecision(6, 2);
            entity.Property(e => e.ClinicalNotes).HasMaxLength(1000);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.PhilHealthMdiseaseCode });
    }
}
