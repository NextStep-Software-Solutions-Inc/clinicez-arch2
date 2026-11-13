using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Tier2_BoundaryAndCornerCases;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Tier 2: Boundary and Corner Cases for F6 (YAKAP Status),
/// F7 (Plain-Note Override), and F8 (Payment Policy Switch).
/// Minimum 5 tests per feature (15 tests total).
/// </summary>
public class Tier2_AdmissionOverrideBoundaryTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-gate-policy-t2";
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();

    // =========================================================================
    // Feature 6: Yakap Non-Mutating Boundary Cases
    // =========================================================================

    [Fact]
    public void F6_B1_YakapExpiringOnExactVisitDate_EvaluatesActive()
    {
        var visitDate = new DateOnly(2026, 12, 31);
        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAK-B1",
            FirstName = "Boundary",
            LastName = "Patient",
            ContactNumber = "+639171234567",
            DateOfBirth = new DateOnly(1990, 1, 1)
        };
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = visitDate, // Exact day
            Status = YakapEnlistmentStatus.Active
        });

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Boundary Patient",
            ScheduledAt = new DateTime(2026, 12, 31, 23, 0, 0, DateTimeKind.Utc),
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var eval = YakapStatusEngine.Evaluate(apt, patient, visitDate);

        eval.HasActiveYakapEnlistment.Should().BeTrue();
    }

    [Fact]
    public void F6_B2_YakapExpiringOneDayBeforeVisitDate_EvaluatesInactive()
    {
        var visitDate = new DateOnly(2027, 1, 1);
        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAK-B2",
            FirstName = "Expired",
            LastName = "Patient",
            ContactNumber = "+639171234567",
            DateOfBirth = new DateOnly(1990, 1, 1)
        };
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active
        });

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Expired Patient",
            ScheduledAt = new DateTime(2027, 1, 1, 10, 0, 0, DateTimeKind.Utc),
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var eval = YakapStatusEngine.Evaluate(apt, patient, visitDate);

        eval.HasActiveYakapEnlistment.Should().BeFalse();
    }

    [Fact]
    public void F6_B3_CancelledEnlistmentStatus_IsEvaluatedInactive()
    {
        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAK-B3",
            FirstName = "Cancelled",
            LastName = "Patient",
            ContactNumber = "+639171234567",
            DateOfBirth = new DateOnly(1990, 1, 1)
        };
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Cancelled
        });

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Cancelled Patient",
            ScheduledAt = DateTime.UtcNow,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var eval = YakapStatusEngine.Evaluate(apt, patient, DateOnly.FromDateTime(DateTime.UtcNow));

        eval.HasActiveYakapEnlistment.Should().BeFalse();
    }

    [Fact]
    public void F6_B4_YakapPatientWithPaidAppointment_LeavesPaidStatusUnchanged()
    {
        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAK-B4",
            FirstName = "AlreadyPaid",
            LastName = "Patient",
            ContactNumber = "+639171234567",
            DateOfBirth = new DateOnly(1990, 1, 1)
        };
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active
        });

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "AlreadyPaid Patient",
            ScheduledAt = DateTime.UtcNow,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Paid,
            PaidAmount = 400.00m
        };

        var eval = YakapStatusEngine.Evaluate(apt, patient, DateOnly.FromDateTime(DateTime.UtcNow));

        eval.CurrentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        apt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
    }

    [Fact]
    public void F6_B5_HistoricalAndCurrentEnlistments_SelectsCurrentActiveYear()
    {
        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAK-B5",
            FirstName = "MultiYear",
            LastName = "Patient",
            ContactNumber = "+639171234567",
            DateOfBirth = new DateOnly(1985, 5, 5)
        };
        // 2025 past enlistment
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            EffectiveYear = 2025,
            EnlistmentDate = new DateOnly(2025, 1, 1),
            ValidUntil = new DateOnly(2025, 12, 31),
            Status = YakapEnlistmentStatus.Active
        });
        // 2026 current enlistment
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active
        });

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "MultiYear Patient",
            ScheduledAt = new DateTime(2026, 7, 1, 10, 0, 0, DateTimeKind.Utc),
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var eval = YakapStatusEngine.Evaluate(apt, patient, new DateOnly(2026, 7, 1));

        eval.HasActiveYakapEnlistment.Should().BeTrue();
        eval.EffectiveYear.Should().Be(2026);
    }

    // =========================================================================
    // Feature 7: Plain-Note Admission Override Boundary Cases
    // =========================================================================

    [Theory]
    [InlineData("stat")]
    [InlineData("help")]
    [InlineData("1234")]
    [InlineData("ok!!")]
    public void F7_B1_NoteWithLessThan5Characters_ThrowsBadRequestException(string shortNote)
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Short Note Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var req = new PlainNoteAdmissionOverrideRequest(apt.Id, shortNote);
        var act = () => AdmissionOverrideEngine.ExecuteOverride(
            req, apt, hasConsultationsWrite: true, hasConsultationsSign: false,
            _staffId, "Staff", new List<AuditEntry>(), new List<string>());

        act.Should().Throw<BadRequestException>()
            .WithMessage("*minimum 5 characters*");
    }

    [Theory]
    [InlineData("STAT!")]
    [InlineData("急診諮詢！")]
    [InlineData("Note1")]
    [InlineData("Valid")]
    public void F7_B2_NoteWithExactly5Characters_Succeeds(string fiveCharNote)
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Five Char Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var req = new PlainNoteAdmissionOverrideRequest(apt.Id, fiveCharNote);
        var result = AdmissionOverrideEngine.ExecuteOverride(
            req, apt, hasConsultationsWrite: true, hasConsultationsSign: false,
            _staffId, "Staff", new List<AuditEntry>(), new List<string>());

        result.ReasonNote.Should().Be(fiveCharNote);
        result.IsEmergencyOverride.Should().BeTrue();
    }

    [Fact]
    public void F7_B3_WhitespacePaddedFourCharNote_ThrowsAfterTrimming()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Padded Short Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var req = new PlainNoteAdmissionOverrideRequest(apt.Id, "   pain   "); // "pain" is 4 chars!
        var act = () => AdmissionOverrideEngine.ExecuteOverride(
            req, apt, hasConsultationsWrite: true, hasConsultationsSign: false,
            _staffId, "Staff", new List<AuditEntry>(), new List<string>());

        act.Should().Throw<BadRequestException>()
            .WithMessage("*minimum 5 characters*");
    }

    [Fact]
    public void F7_B4_StaffLackingBothPermissions_ThrowsForbiddenException()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Unauthorized Attempt Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var req = new PlainNoteAdmissionOverrideRequest(apt.Id, "Valid note with plenty of explanation text");
        var act = () => AdmissionOverrideEngine.ExecuteOverride(
            req, apt, hasConsultationsWrite: false, hasConsultationsSign: false,
            _staffId, "Receptionist", new List<AuditEntry>(), new List<string>());

        act.Should().Throw<ForbiddenException>()
            .WithMessage("*requires ConsultationsWrite or ConsultationsSign authority*");
    }

    [Fact]
    public void F7_B5_ExplicitCustomReasonCode_IsPreservedAlongsideNote()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Custom Code Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var req = new PlainNoteAdmissionOverrideRequest(apt.Id, "Typhoon disaster emergency protocol active", ReasonCode: "DISASTER-TYPHOON");
        var result = AdmissionOverrideEngine.ExecuteOverride(
            req, apt, hasConsultationsWrite: true, hasConsultationsSign: false,
            _staffId, "Doctor", new List<AuditEntry>(), new List<string>());

        result.ReasonCode.Should().Be("DISASTER-TYPHOON");
        apt.EmergencyOverrideReasonCode.Should().Be("DISASTER-TYPHOON");
    }

    // =========================================================================
    // Feature 8: Payment Policy Switch Boundary Cases
    // =========================================================================

    [Fact]
    public void F8_B1_SwitchFromPostpaidToPrepaid_GeneratesInvoiceWithDefaultFee()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Switch Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Postpaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var invoices = new List<Invoice>();
        var result = PaymentPolicySwitchEngine.SwitchPolicy(apt, "Prepaid", invoices, defaultFee: 550.00m);

        result.NewPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        result.InvoiceId.Should().NotBeNull();
        invoices.Should().ContainSingle(i => i.GrossAmount == 550.00m);
    }

    [Fact]
    public void F8_B2_SwitchFromPostpaidToExempt_UpdatesStatusToExempt()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Exempt Switch Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Postpaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var result = PaymentPolicySwitchEngine.SwitchPolicy(apt, "Exempt", new List<Invoice>());

        result.NewPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        result.UpdatedStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
    }

    [Theory]
    [InlineData("FreeOfCharge")]
    [InlineData("Installments")]
    [InlineData("PartialPrepaid")]
    public void F8_B3_InvalidPolicyString_ThrowsArgumentException(string invalid)
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Invalid Switch Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult
        };

        var act = () => PaymentPolicySwitchEngine.SwitchPolicy(apt, invalid, new List<Invoice>());

        act.Should().Throw<ArgumentException>()
            .WithMessage("*Invalid payment policy*");
    }

    [Fact]
    public void F8_B4_SwitchPolicy_CaseInsensitivePolicyString_ParsesSuccessfully()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Case Insensitive Switch",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var result = PaymentPolicySwitchEngine.SwitchPolicy(apt, "eXeMpT", new List<Invoice>());

        result.NewPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
    }

    [Fact]
    public void F8_B5_RedundantPolicySwitch_RetainsExistingInvoiceWithoutDuplicate()
    {
        var existingInvoiceId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Redundant Switch",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            InvoiceId = existingInvoiceId
        };

        var invoices = new List<Invoice>();
        var result = PaymentPolicySwitchEngine.SwitchPolicy(apt, "Prepaid", invoices);

        result.InvoiceId.Should().Be(existingInvoiceId);
        invoices.Should().BeEmpty(); // No duplicate invoice created!
    }
}
