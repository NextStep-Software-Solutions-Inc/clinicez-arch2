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

public sealed class PatientSexualHistoryConfiguration : IEntityTypeConfiguration<PatientSexualHistory>
{
    public void Configure(EntityTypeBuilder<PatientSexualHistory> entity)
    {
            entity.ToTable("PatientSexualHistories");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientId).IsRequired();
            entity.Property(e => e.ConsentStatusCode).IsRequired().HasMaxLength(10);
            entity.Property(e => e.EverHadSex).IsRequired();
            entity.Property(e => e.IsSexuallyActive).IsRequired();
            entity.Property(e => e.PartnerTypes).HasMaxLength(100);
            entity.Property(e => e.MalePartnerRecentAnalNeovagYm).HasMaxLength(7);
            entity.Property(e => e.MalePartnerRecentCondomlessYm).HasMaxLength(7);
            entity.Property(e => e.FemalePartnerRecentAnalNeovagYm).HasMaxLength(7);
            entity.Property(e => e.FemalePartnerRecentCondomlessYm).HasMaxLength(7);
            entity.Property(e => e.SexualRiskBehaviorCodes).HasMaxLength(200);
            entity.Property(e => e.RecentRiskMonthYear).HasMaxLength(7);
            entity.Property(e => e.OtherRiskConcernsSpec).HasMaxLength(250);
            entity.Property(e => e.StiSpecification).HasMaxLength(250);
            entity.Property(e => e.ContraceptiveMethodsUsed).HasMaxLength(200);
            entity.Property(e => e.LastHivScreenMonthYear).HasMaxLength(7);
            entity.Property(e => e.SexualViolenceHistory).HasMaxLength(500);

            entity.HasOne(e => e.Patient)
                .WithOne(p => p.SexualHistory)
                .HasForeignKey<PatientSexualHistory>(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
    }
}
