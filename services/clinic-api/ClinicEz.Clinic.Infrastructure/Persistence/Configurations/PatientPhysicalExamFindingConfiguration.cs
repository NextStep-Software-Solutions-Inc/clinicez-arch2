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

public sealed class PatientPhysicalExamFindingConfiguration : IEntityTypeConfiguration<PatientPhysicalExamFinding>
{
    public void Configure(EntityTypeBuilder<PatientPhysicalExamFinding> entity)
    {
            entity.ToTable("PatientPhysicalExamFindings");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.System).IsRequired().HasMaxLength(50);
            entity.Property(e => e.FindingTitle).IsRequired().HasMaxLength(255);
            entity.Property(e => e.PhilHealthFindingCode).HasMaxLength(50);
            entity.Property(e => e.BodySite).HasMaxLength(100);
            entity.Property(e => e.Laterality).HasMaxLength(50);
            entity.Property(e => e.Remarks).HasMaxLength(1000);

            entity.HasIndex(e => new { e.ClinicId, e.PhysicalExamId });
            entity.HasIndex(e => new { e.ClinicId, e.System });
    }
}
