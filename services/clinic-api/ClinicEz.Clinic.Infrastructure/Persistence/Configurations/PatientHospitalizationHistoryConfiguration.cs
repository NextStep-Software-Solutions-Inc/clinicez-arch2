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

public sealed class PatientHospitalizationHistoryConfiguration : IEntityTypeConfiguration<PatientHospitalizationHistory>
{
    public void Configure(EntityTypeBuilder<PatientHospitalizationHistory> entity)
    {
            entity.ToTable("PatientHospitalizationHistories");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientId).IsRequired();
            entity.Property(e => e.ReasonForAdmission).IsRequired().HasMaxLength(2000);
            entity.Property(e => e.PrimaryIcd10Code).HasMaxLength(20);
            entity.Property(e => e.HospitalFacilityName).HasMaxLength(255);
            entity.Property(e => e.AttendingPhysicianName).HasMaxLength(150);
            entity.Property(e => e.DischargeDisposition).HasMaxLength(100);
            entity.Property(e => e.ClinicalSummaryNotes).HasMaxLength(2000);

            entity.HasOne(e => e.Patient)
                .WithMany(p => p.HospitalizationHistories)
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
    }
}
