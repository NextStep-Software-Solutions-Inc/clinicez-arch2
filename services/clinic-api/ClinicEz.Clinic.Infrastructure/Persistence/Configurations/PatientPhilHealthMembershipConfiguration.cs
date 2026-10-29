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

public sealed class PatientPhilHealthMembershipConfiguration : IEntityTypeConfiguration<PatientPhilHealthMembership>
{
    public void Configure(EntityTypeBuilder<PatientPhilHealthMembership> entity)
    {
            entity.ToTable("PatientPhilHealthMemberships");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.MemberPin).IsRequired().HasMaxLength(20);
            entity.Property(e => e.MemberType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.DependentRelationship).HasMaxLength(50);
            entity.Property(e => e.PrincipalMemberPin).HasMaxLength(20);
            entity.Property(e => e.PrincipalLastName).HasMaxLength(100);
            entity.Property(e => e.PrincipalFirstName).HasMaxLength(100);
            entity.Property(e => e.PrincipalMiddleName).HasMaxLength(100);
            entity.Property(e => e.PrincipalSuffix).HasMaxLength(20);
            entity.Property(e => e.PrincipalGender).HasMaxLength(50);
            entity.Property(e => e.MembershipCategoryCode).HasMaxLength(50);
            entity.Property(e => e.MembershipCategoryDesc).HasMaxLength(200);
            entity.Property(e => e.EmployerPin).HasMaxLength(20);
            entity.Property(e => e.EmployerName).HasMaxLength(200);
            entity.Property(e => e.DefaultWalkInAtc).HasMaxLength(50);
            entity.Property(e => e.PrincipalMemberLandlineNumber).HasMaxLength(30);
            entity.Property(e => e.PrincipalMemberMobileNumber).HasMaxLength(30);
            entity.Property(e => e.PrincipalMemberEmail).HasMaxLength(150);

            entity.HasIndex(e => new { e.ClinicId, e.PatientId })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
            entity.HasIndex(e => new { e.ClinicId, e.MemberPin });
    }
}
