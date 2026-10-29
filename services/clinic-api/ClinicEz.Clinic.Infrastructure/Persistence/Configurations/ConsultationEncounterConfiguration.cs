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

public sealed class ConsultationEncounterConfiguration : IEntityTypeConfiguration<ConsultationEncounter>
{
    public void Configure(EntityTypeBuilder<ConsultationEncounter> entity)
    {
            entity.ToTable("Consultations");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TenantId).IsRequired().HasMaxLength(100);
            entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.DoctorName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.DoctorPrcLicense).HasMaxLength(50);
            entity.Property(e => e.DoctorPtr).HasMaxLength(50);
            entity.Property(e => e.DoctorS2License).HasMaxLength(50);
            entity.Property(e => e.DoctorPhilHealthPan).HasMaxLength(50);
            entity.Property(e => e.PhilHealthAtc).HasMaxLength(50);
            entity.Property(e => e.PhilHealthCaseNo).HasMaxLength(50);
            entity.Property(e => e.PhilHealthSoapTransNo).HasMaxLength(50);
            entity.Property(e => e.VisitWorkflowMode).IsRequired().HasConversion<string>().HasMaxLength(50);
            entity.Property(e => e.PhilHealthVisitType).HasMaxLength(50);
            entity.Property(e => e.ServiceDeliveryMethod).HasMaxLength(30);
            entity.Property(e => e.PatientIdentityVerificationId);
            entity.Property(e => e.HasCoPayment).HasDefaultValue(false);
            entity.Property(e => e.CoPaymentDate);
            entity.Property(e => e.CoPaymentAmount).HasPrecision(18, 2);
            entity.Property(e => e.CoPaymentBalance).HasPrecision(18, 2);
            entity.Property(e => e.ConsultationReasonCode).HasMaxLength(10);
            entity.Property(e => e.ConsultationReasonDetails).HasMaxLength(250);
            entity.Property(e => e.SpecificDiagnosisCodes).HasMaxLength(255);
            entity.Property(e => e.CounselingCodes).HasMaxLength(100);
            entity.Property(e => e.RoutineVaccineName).HasMaxLength(255);
            entity.Property(e => e.RoutineVaccineDate);
            entity.Property(e => e.BreastCancerScreeningCode).HasMaxLength(50);
            entity.Property(e => e.CervicalCancerScreeningCode).HasMaxLength(50);
            entity.Property(e => e.ColorectalCancerScreeningCode).HasMaxLength(50);
            entity.Property(e => e.ProstateCancerScreeningCode).HasMaxLength(50);
            entity.Property(e => e.AdultsRoutineScreeningCode).HasMaxLength(100);
            entity.Property(e => e.PediatricRoutineScreeningCode).HasMaxLength(100);
            entity.Property(e => e.PrenatalScreeningServicesCode).HasMaxLength(100);
            entity.Property(e => e.DiagnosticServicesOption).HasMaxLength(10);
            entity.Property(e => e.HasMedicationPrescription).HasDefaultValue(false);
            entity.Property(e => e.HasReferral).HasDefaultValue(false);
            entity.Property(e => e.OtherMedicalAdviceSpec).HasMaxLength(500);
            entity.Property(e => e.HasFollowUp).HasDefaultValue(false);
            entity.Property(e => e.FollowUpScheduleText).HasMaxLength(100);
            entity.Property(e => e.FollowUpReason).HasMaxLength(250);
            entity.Property(e => e.FollowUpVaccineName).HasMaxLength(255);
            entity.Property(e => e.FollowUpVaccineNextDate);
            entity.Property(e => e.DoctorDesignation).HasMaxLength(150);
            entity.Property(e => e.RxClaimToken).HasMaxLength(200);

            entity.HasOne(e => e.Patient)
                .WithMany()
                .HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(e => e.Diagnoses)
                .WithOne(d => d.ConsultationEncounter)
                .HasForeignKey(d => d.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(e => e.Prescriptions)
                .WithOne(p => p.ConsultationEncounter)
                .HasForeignKey(p => p.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(e => e.ReviewOfSystemsItems)
                .WithOne(r => r.ConsultationEncounter)
                .HasForeignKey(r => r.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.ObGyneExam)
                .WithOne(o => o.ConsultationEncounter)
                .HasForeignKey<EncounterObGyneExam>(o => o.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(e => e.PediatricMilestones)
                .WithOne(m => m.ConsultationEncounter)
                .HasForeignKey(m => m.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.AdolescentAssessment)
                .WithOne(a => a.ConsultationEncounter)
                .HasForeignKey<EncounterAdolescentAssessment>(a => a.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(e => e.HeadsssAssessments)
                .WithOne(h => h.ConsultationEncounter)
                .HasForeignKey(h => h.ConsultationEncounterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId });
            entity.HasIndex(e => new { e.TenantId, e.BranchId });
            entity.HasIndex(e => new { e.TenantId, e.ClinicId, e.EncounterDate });
            entity.HasIndex(e => new { e.ClinicId, e.PatientId, e.EncounterDate });
    }
}
