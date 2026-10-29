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

public sealed class FacilitySettingsConfiguration : IEntityTypeConfiguration<FacilitySettings>
{
    public void Configure(EntityTypeBuilder<FacilitySettings> entity)
    {
            entity.ToTable("Settings");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.TenantSlug).HasMaxLength(100);
            entity.Property(e => e.FacilitySlug).HasMaxLength(100);
            entity.Property(e => e.ClinicName).IsRequired().HasMaxLength(200);
            entity.Property(e => e.AccreditationNumber).HasMaxLength(100);
            entity.Property(e => e.LetterheadDohLto).HasMaxLength(100);
            entity.Property(e => e.LetterheadAccentColorHex).HasMaxLength(20);
            entity.Property(e => e.PmccNumber).HasMaxLength(100);
            entity.Property(e => e.SoftwareCertificateId).HasMaxLength(100);
            entity.Property(e => e.KonsultaEndpoint).HasMaxLength(255);
            entity.Property(e => e.PhilHealthSecretKey).HasMaxLength(255);
            entity.Property(e => e.PhilHealthBaseUrl).HasMaxLength(255);
            entity.Property(e => e.BranchPhilHealthSecretKey).HasMaxLength(255);
            entity.Property(e => e.BranchPhilHealthBaseUrl).HasMaxLength(255);
            entity.Property(e => e.IsPhilHealthOverridden).HasDefaultValue(false);
            entity.Property(e => e.BranchId);
            entity.Property(e => e.BranchName).HasMaxLength(200);
            entity.Property(e => e.BranchPhilHealthAccreditationNumber).HasMaxLength(100);
            entity.Property(e => e.BranchPmccNumber).HasMaxLength(100);
            entity.Property(e => e.BranchSoftwareCertificateId).HasMaxLength(100);
            entity.Property(e => e.BranchKonsultaEndpoint).HasMaxLength(255);
            entity.Property(e => e.IsBranchPhilHealthAccredited).HasDefaultValue(false);
            entity.Property(e => e.DefaultConsultationFee).HasPrecision(18, 2);
            entity.Property(e => e.VatRate).HasPrecision(5, 4);
            entity.Property(e => e.CashierMode).HasMaxLength(50).HasDefaultValue("ClinicDesk");
            entity.Property(e => e.PreferredChartLayout).HasMaxLength(50).HasDefaultValue("modal");
            entity.Property(e => e.IsJoinEnabled).HasDefaultValue(true);
            entity.Property(e => e.JoinCode).HasMaxLength(50);
            entity.Property(e => e.JoinCodeExpiresAt);
            entity.Property(e => e.PatientSearchDisplayFieldsJson).HasColumnType("text");
            entity.Property(e => e.EodReconciliationTime).HasMaxLength(10).HasDefaultValue("21:00");
            entity.Property(e => e.AutoEodEnabled).HasDefaultValue(true);
            entity.Property(e => e.TvDisplayMaskPatientNames).HasDefaultValue(true);
            entity.Property(e => e.TvDisplayPin).HasMaxLength(50);
            entity.Property(e => e.EnableQueuePushNotifications).HasDefaultValue(true);
            entity.Property(e => e.QueuePushNotificationThreshold).HasDefaultValue(2);
            entity.Property(e => e.EnableChipLevelQueueCalling).HasDefaultValue(false);
            entity.Property(e => e.IsWorkspaceEligible).HasDefaultValue(false);
            entity.Property(e => e.IsDirectoryPublished).HasDefaultValue(false);
            entity.Property(e => e.IsOnlineBookingPaused).HasDefaultValue(false);
            entity.Property(e => e.DefaultApproverName).HasMaxLength(200);
            entity.Property(e => e.DefaultApproverTitle).HasMaxLength(200);
            entity.Property(e => e.DocumentSignatoriesJson).HasColumnType("text");
            entity.Property(e => e.EnableAppointmentReminders).HasDefaultValue(true);
            entity.Property(e => e.AppointmentReminder24hEnabled).HasDefaultValue(true);
            entity.Property(e => e.AppointmentReminder2hEnabled).HasDefaultValue(true);
            entity.Property(e => e.EnableStaffAppointmentNotifications).HasDefaultValue(true);

            entity.Property(e => e.TimeZoneId).HasMaxLength(100);
            entity.Property(e => e.DateFormat).HasMaxLength(50);
            entity.Property(e => e.TimeFormat).HasMaxLength(20);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
    }
}
