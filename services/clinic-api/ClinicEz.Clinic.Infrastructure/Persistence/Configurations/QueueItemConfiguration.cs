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

public sealed class QueueItemConfiguration : IEntityTypeConfiguration<QueueItem>
{
    public void Configure(EntityTypeBuilder<QueueItem> entity)
    {
            entity.ToTable("QueueItems");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.QueueNumber).IsRequired().HasMaxLength(20);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.DoctorName).HasMaxLength(150);
            entity.Property(e => e.ChiefComplaint).HasMaxLength(255);
            entity.Property(e => e.RoomOrStation).HasMaxLength(100);
            entity.Property(e => e.ApproachingNotificationSent).HasDefaultValue(false);
            entity.Property(e => e.CalledNotificationSent).HasDefaultValue(false);

            entity.Property(e => e.VisitWorkflowMode).IsRequired().HasConversion<string>().HasMaxLength(50);
            entity.Property(e => e.VisitType)
                .HasConversion<string>()
                .HasMaxLength(50)
                .HasDefaultValue(VisitType.Consultation)
                .HasSentinel((VisitType)0);
            entity.Property(e => e.DischargeNotes).HasMaxLength(1000);
            entity.Property(e => e.DivertedToFacility).HasMaxLength(255);
            entity.Property(e => e.TransportMode).HasMaxLength(100);
            entity.Property(e => e.ParamedicOrEscortName).HasMaxLength(150);
            entity.Property(e => e.HandoverSummary).HasMaxLength(2000);

            entity.HasOne(e => e.Patient)
                .WithMany()
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Appointment)
                .WithMany()
                .HasForeignKey(e => e.AppointmentId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.Room)
                .WithMany(r => r.QueueItems)
                .HasForeignKey(e => e.RoomId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.PatientVitals)
                .WithOne(v => v.QueueItem)
                .HasForeignKey<PatientVitals>(v => v.QueueItemId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.Consultation)
                .WithOne(c => c.QueueItem)
                .HasForeignKey<ConsultationEncounter>(c => c.QueueItemId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.QueueDate });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.CheckInTime });
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.QueueDate, e.Status });
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.VisitType });
    }
}
