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

public sealed class PatientSurgicalHistoryConfiguration : IEntityTypeConfiguration<PatientSurgicalHistory>
{
    public void Configure(EntityTypeBuilder<PatientSurgicalHistory> entity)
    {
            entity.ToTable("PatientSurgicalHistories");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ProcedureName).IsRequired().HasMaxLength(255);
            entity.Property(e => e.ProcedureCode).HasMaxLength(50);
            entity.Property(e => e.HospitalName).HasMaxLength(255);
            entity.Property(e => e.SurgeonName).HasMaxLength(150);
            entity.Property(e => e.AnesthesiaType).HasMaxLength(100);
            entity.Property(e => e.BodySite).HasMaxLength(100);
            entity.Property(e => e.Laterality).HasMaxLength(50);
            entity.Property(e => e.Findings).HasMaxLength(1000);
            entity.Property(e => e.Complications).HasMaxLength(1000);
            entity.Property(e => e.Remarks).HasMaxLength(1000);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.PatientId, e.SurgeryDate });
    }
}
