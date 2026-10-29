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

public sealed class AppointmentConfiguration : IEntityTypeConfiguration<Appointment>
{
    public void Configure(EntityTypeBuilder<Appointment> entity)
    {
            entity.ToTable("Appointments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).HasMaxLength(100);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.ServiceType).HasMaxLength(255);
            entity.Property(e => e.Reason).HasMaxLength(255);
            entity.Property(e => e.VisitWorkflowMode).IsRequired().HasConversion<string>().HasMaxLength(50);
            entity.Property(e => e.EndTimeUtc).IsRequired();
            entity.Property(e => e.Version).IsRowVersion();

            entity.HasOne(e => e.Patient)
                .WithMany()
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => e.ScheduledAt);
            entity.HasIndex(e => new { e.ClinicId, e.DoctorId, e.ScheduledAt, e.EndTimeUtc });
            entity.HasIndex(e => new { e.Status, e.ScheduledAt, e.Reminder24hSent });
            entity.HasIndex(e => new { e.Status, e.ScheduledAt, e.Reminder2hSent });
    }
}
