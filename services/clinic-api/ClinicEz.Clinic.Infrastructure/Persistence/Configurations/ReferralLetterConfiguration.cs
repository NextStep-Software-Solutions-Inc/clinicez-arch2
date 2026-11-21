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

public sealed class ReferralLetterConfiguration : IEntityTypeConfiguration<ReferralLetter>
{
    public void Configure(EntityTypeBuilder<ReferralLetter> entity)
    {
            entity.ToTable("ReferralLetters");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.ReferralNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.ReferringDoctorName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.ReferredToFacility).IsRequired().HasMaxLength(150);
            entity.Property(e => e.ReferredDepartment).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Urgency).HasMaxLength(50);
            entity.Property(e => e.SecurityDigest).HasMaxLength(100);
            entity.Property(e => e.ReferringDoctorPrcNumber).HasMaxLength(50);
            entity.Property(e => e.PhilHealthReferralTransNo).HasMaxLength(23);
            entity.Property(e => e.ReferralTypeCodes).HasMaxLength(100);
            entity.Property(e => e.PrimaryCareServiceCodes).HasMaxLength(100);
            entity.Property(e => e.FacilityServiceCodes).HasMaxLength(100);
            entity.Property(e => e.SpecialistType).HasMaxLength(100);
            entity.Property(e => e.SpecialistOtherSpecify).HasMaxLength(255);
            entity.Property(e => e.OthersSpecify).HasMaxLength(255);
            entity.Property(e => e.TransportMode).HasMaxLength(20);
            entity.Property(e => e.ClinicalSummary).HasMaxLength(2000);

            entity.HasOne(e => e.Patient)
                .WithMany()
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.ReferralNumber })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.SecurityDigest });
    }
}
