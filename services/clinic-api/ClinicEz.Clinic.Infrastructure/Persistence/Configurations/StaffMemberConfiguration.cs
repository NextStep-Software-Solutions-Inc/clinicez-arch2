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

public sealed class StaffMemberConfiguration : IEntityTypeConfiguration<StaffMember>
{
    public void Configure(EntityTypeBuilder<StaffMember> entity)
    {
            entity.ToTable("StaffMembers");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.FirstName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.LastName).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Email).HasMaxLength(255);
            entity.Property(e => e.PhoneNumber).HasMaxLength(50);
            entity.Property(e => e.PrcLicenseNumber).HasMaxLength(50);
            entity.Property(e => e.PtrNumber).HasMaxLength(50);
            entity.Property(e => e.S2LicenseNumber).HasMaxLength(50);
            entity.Property(e => e.Specialty).HasMaxLength(100);
            entity.Property(e => e.PhilHealthPan).HasMaxLength(50);
            entity.Property(e => e.SignatureSpecimen).HasColumnType("text");
            entity.Property(e => e.DefaultSignatureMode).HasConversion<string>().HasMaxLength(50);

            entity.HasOne(e => e.ClinicRole)
                .WithMany(r => r.StaffMembers)
                .HasForeignKey(e => e.ClinicRoleId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.Property(e => e.AssignedRoomIdsJson).HasColumnType("text");

            entity.Property(e => e.PasswordHash).HasMaxLength(500);
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(50).HasDefaultValue(StaffAccountStatus.Active).HasSentinel((StaffAccountStatus)0);
            entity.Property(e => e.InvitationToken).HasMaxLength(128);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId });
            entity.HasIndex(e => new { e.ClinicId, e.Email })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false AND \"Email\" IS NOT NULL");
            entity.HasIndex(e => e.InvitationToken)
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false AND \"InvitationToken\" IS NOT NULL");
    }
}
