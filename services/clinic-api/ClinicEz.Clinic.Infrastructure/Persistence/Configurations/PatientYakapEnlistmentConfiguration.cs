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

public sealed class PatientYakapEnlistmentConfiguration : IEntityTypeConfiguration<PatientYakapEnlistment>
{
    public void Configure(EntityTypeBuilder<PatientYakapEnlistment> entity)
    {
            entity.ToTable("PatientYakapEnlistments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Status).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Source).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PackageType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.CaseNo).HasMaxLength(50);
            entity.Property(e => e.SelectionControlNumber).HasMaxLength(23);
            entity.Property(e => e.HciAccreditationNumber).HasMaxLength(9);
            entity.Property(e => e.YesReferenceNo).HasMaxLength(10);
            entity.Property(e => e.RegistrationStatusCode).HasMaxLength(50);
            entity.Property(e => e.EmpanelmentMethod).HasMaxLength(20);
            entity.Property(e => e.IdentityVerificationId);
            entity.Property(e => e.FpeClassificationType).HasMaxLength(30);
            entity.Property(e => e.ServiceDeliveryMethod).HasMaxLength(30);
            entity.Property(e => e.FacilitatorType).HasMaxLength(30);
            entity.Property(e => e.FacilitatorName).HasMaxLength(150);
            entity.Property(e => e.CoPaymentAmount).HasPrecision(18, 2);
            entity.Property(e => e.CoPaymentBalance).HasPrecision(18, 2);
            entity.Property(e => e.EnlistmentTransNo).HasMaxLength(50);
            entity.Property(e => e.ProfilingTransNo).HasMaxLength(50);
            entity.Property(e => e.ProfilingAtc).HasMaxLength(50);
            entity.Property(e => e.CreatedByStaffName).HasMaxLength(150);

            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.EffectiveYear })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.Status });
            entity.HasIndex(e => new { e.ClinicId, e.EffectiveYear });
    }
}
