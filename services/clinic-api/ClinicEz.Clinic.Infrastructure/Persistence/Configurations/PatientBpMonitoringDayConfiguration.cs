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

public sealed class PatientBpMonitoringDayConfiguration : IEntityTypeConfiguration<PatientBpMonitoringDay>
{
    public void Configure(EntityTypeBuilder<PatientBpMonitoringDay> entity)
    {
            entity.ToTable("PatientBpMonitoringDays");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.BpMonitoringLogId).IsRequired();
            entity.Property(e => e.DayNumber).IsRequired();
            entity.Property(e => e.LocationCode).HasMaxLength(10);

            entity.HasOne(e => e.BpMonitoringLog)
                .WithMany(l => l.Days)
                .HasForeignKey(e => e.BpMonitoringLogId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.BpMonitoringLogId, e.DayNumber })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
    }
}
