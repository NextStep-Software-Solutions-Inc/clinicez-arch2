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

public sealed class PatientBpMonitoringLogConfiguration : IEntityTypeConfiguration<PatientBpMonitoringLog>
{
    public void Configure(EntityTypeBuilder<PatientBpMonitoringLog> entity)
    {
            entity.ToTable("PatientBpMonitoringLogs");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientId).IsRequired();
            entity.Property(e => e.StartDate).IsRequired();
            entity.Property(e => e.EndDate).IsRequired();
            entity.Property(e => e.ClinicalInterpretation).HasMaxLength(1000);

            entity.HasOne(e => e.Patient)
                .WithMany(p => p.BpMonitoringLogs)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.ConsultationEncounter)
                .WithMany(c => c.BpMonitoringLogs)
                .HasForeignKey(e => e.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
    }
}
