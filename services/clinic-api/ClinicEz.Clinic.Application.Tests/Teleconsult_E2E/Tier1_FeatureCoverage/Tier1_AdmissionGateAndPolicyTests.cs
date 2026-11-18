using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Tier1_FeatureCoverage;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Tier 1: Feature Coverage for F6 (Non-Mutating YAKAP Status),
/// F7 (Plain-Note Admission Override), and F8 (Update Teleconsult Payment Policy).
/// Minimum 5 tests per feature (15 tests total).
/// </summary>
public class Tier1_AdmissionGateAndPolicyTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-gate-policy-t1";
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();

    // =========================================================================
    // Feature 6: Non-Mutating YAKAP Status
    // =========================================================================

    [Fact]
    public void F6_T1_ActiveYakapEnlistment_EvaluatesHasActiveYakapTrue()
    {
        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAK-01",
            FirstName = "Maria",
            LastName = "Orosa",
            ContactNumber = "+639171234567",
            DateOfBirth = new DateOnly(1893, 11, 29)
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
            PatientName = "Maria Orosa",
            ScheduledAt = new DateTime(2026, 5, 10, 10, 0, 0, DateTimeKind.Utc),
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var eval = YakapStatusEngine.Evaluate(apt, patient, new DateOnly(2026, 5, 10));

        eval.HasActiveYakapEnlistment.Should().BeTrue();
        eval.EffectiveYear.Should().Be(2026);
    }

    [Fact]
    public void F6_T2_NoYakapEnlistment_EvaluatesHasActiveYakapFalse()
    {
        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAK-02",
            FirstName = "Leona",
            LastName = "Florentino",
            ContactNumber = "+639171234567",
            DateOfBirth = new DateOnly(1849, 4, 19)
        };

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Leona Florentino",
            ScheduledAt = DateTime.UtcNow,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var eval = YakapStatusEngine.Evaluate(apt, patient, DateOnly.FromDateTime(DateTime.UtcNow));

        eval.HasActiveYakapEnlistment.Should().BeFalse();
        eval.EffectiveYear.Should().BeNull();
    }

    [Fact]
    public void F6_T3_ActiveYakap_DoesNotMutatePaymentPolicy()
    {
        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAK-03",
            FirstName = "Concepcion",
            LastName = "Felix",
            ContactNumber = "+639171234567",
            DateOfBirth = new DateOnly(1884, 2, 9)
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
            PatientName = "Concepcion Felix",
            ScheduledAt = new DateTime(2026, 6, 15, 9, 0, 0, DateTimeKind.Utc),
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var eval = YakapStatusEngine.Evaluate(apt, patient, new DateOnly(2026, 6, 15));

        eval.PolicyWasMutated.Should().BeFalse();
        apt.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
    }

    [Fact]
    public void F6_T4_ActiveYakap_DoesNotMutatePaymentStatus()
    {
        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAK-04",
            FirstName = "Paz",
            LastName = "Mendoza",
            ContactNumber = "+639171234567",
            DateOfBirth = new DateOnly(1884, 10, 1)
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
            PatientName = "Paz Mendoza",
            ScheduledAt = new DateTime(2026, 7, 20, 14, 0, 0, DateTimeKind.Utc),
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var eval = YakapStatusEngine.Evaluate(apt, patient, new DateOnly(2026, 7, 20));

        apt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
        eval.CurrentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
    }

    [Fact]
    public void F6_T5_ExpiredYakapEnlistment_EvaluatesInactive()
    {
        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-YAK-05",
            FirstName = "Encarnacion",
            LastName = "Alzona",
            ContactNumber = "+639171234567",
            DateOfBirth = new DateOnly(1895, 3, 23)
        };
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

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Encarnacion Alzona",
            ScheduledAt = new DateTime(2026, 8, 1, 10, 0, 0, DateTimeKind.Utc),
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var eval = YakapStatusEngine.Evaluate(apt, patient, new DateOnly(2026, 8, 1));

        eval.HasActiveYakapEnlistment.Should().BeFalse();
    }

    // =========================================================================
    // Feature 7: Plain-Note Admission Override
    // =========================================================================

    [Fact]
    public void F7_T1_StaffWithConsultationsWrite_AuthorizesPlainNoteOverride()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Gliceria Marella",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var req = new PlainNoteAdmissionOverrideRequest(apt.Id, "Patient in urgent respiratory distress, immediate teleconsult required.");
        var audits = new List<AuditEntry>();
        var events = new List<string>();

        var result = AdmissionOverrideEngine.ExecuteOverride(
            req, apt, hasConsultationsWrite: true, hasConsultationsSign: false,
            _staffId, "Nurse Cruz", audits, events);

        result.IsEmergencyOverride.Should().BeTrue();
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        apt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
    }

    [Fact]
    public void F7_T2_DoctorWithConsultationsSign_AuthorizesPlainNoteOverride()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Nazaria Lagos",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var req = new PlainNoteAdmissionOverrideRequest(apt.Id, "Acute chest discomfort triage via teleconsultation.");
        var audits = new List<AuditEntry>();
        var events = new List<string>();

        var result = AdmissionOverrideEngine.ExecuteOverride(
            req, apt, hasConsultationsWrite: false, hasConsultationsSign: true,
            _staffId, "Dr. Santos", audits, events);

        result.IsEmergencyOverride.Should().BeTrue();
        result.AuthorizedByName.Should().Be("Dr. Santos");
    }

    [Fact]
    public void F7_T3_OmittedReasonCode_DefaultsToStaffOverride()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Agueda Kahabagan",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var req = new PlainNoteAdmissionOverrideRequest(apt.Id, "Urgent teleconsult consultation authorized by clinical staff.");
        var audits = new List<AuditEntry>();
        var events = new List<string>();

        var result = AdmissionOverrideEngine.ExecuteOverride(
            req, apt, hasConsultationsWrite: true, hasConsultationsSign: false,
            _staffId, "Staff Reyes", audits, events);

        result.ReasonCode.Should().Be("STAFF-OVERRIDE");
        apt.EmergencyOverrideReasonCode.Should().Be("STAFF-OVERRIDE");
    }

    [Fact]
    public void F7_T4_Override_WritesImmutableWormAuditEntry()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Teresa Magbanua",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var req = new PlainNoteAdmissionOverrideRequest(apt.Id, "Patient unable to access online cashier; clinical emergency bypass.");
        var audits = new List<AuditEntry>();
        var events = new List<string>();

        var result = AdmissionOverrideEngine.ExecuteOverride(
            req, apt, hasConsultationsWrite: true, hasConsultationsSign: false,
            _staffId, "Staff Flores", audits, events);

        audits.Should().ContainSingle();
        var entry = audits[0];
        entry.Action.Should().Be("teleconsult.admission.emergency_override");
        entry.Severity.Should().Be(ClinicAuditSeverities.Emergency);
        entry.Category.Should().Be(ClinicAuditCategories.Clinical);
        entry.TargetEntityId.Should().Be(apt.Id.ToString());
    }

    [Fact]
    public void F7_T5_Override_EmitsCommsCallPaymentClearedEvent()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Trinidad Tecson",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            CallId = Guid.NewGuid()
        };

        var req = new PlainNoteAdmissionOverrideRequest(apt.Id, "Critical follow-up consult required without prepayment delay.");
        var audits = new List<AuditEntry>();
        var events = new List<string>();

        var result = AdmissionOverrideEngine.ExecuteOverride(
            req, apt, hasConsultationsWrite: true, hasConsultationsSign: false,
            _staffId, "Staff Dizon", audits, events);

        result.CommsPaymentClearedEnqueued.Should().BeTrue();
        events.Should().Contain(e => e.StartsWith($"comms.call.payment.cleared:{apt.CallId}:STAFF-OVERRIDE"));
    }

    // =========================================================================
    // Feature 8: Update Teleconsult Payment Policy
    // =========================================================================

    [Fact]
    public void F8_T1_SwitchToExempt_UpdatesPolicyAndStatusToExempt()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Rosa Sevilla",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var invoices = new List<Invoice>();

        var result = PaymentPolicySwitchEngine.SwitchPolicy(apt, "Exempt", invoices);

        result.PreviousPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        result.NewPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        result.UpdatedStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        apt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
    }

    [Fact]
    public void F8_T2_SwitchToPostpaid_SetsStatusPendingWithoutPreAdmissionGate()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Josefa Llanes Escoda",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var invoices = new List<Invoice>();

        var result = PaymentPolicySwitchEngine.SwitchPolicy(apt, "Postpaid", invoices);

        result.NewPolicy.Should().Be(TeleconsultPaymentPolicy.Postpaid);
        result.UpdatedStatus.Should().Be(TeleconsultPaymentStatus.Pending);
    }

    [Fact]
    public void F8_T3_SwitchFromExemptToPrepaid_CreatesLinkedInvoice()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Marina Dizon",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt
        };

        var invoices = new List<Invoice>();

        var result = PaymentPolicySwitchEngine.SwitchPolicy(apt, "Prepaid", invoices, defaultFee: 500.00m);

        result.NewPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        result.UpdatedStatus.Should().Be(TeleconsultPaymentStatus.Pending);
        result.InvoiceId.Should().NotBeNull();
        invoices.Should().ContainSingle(i => i.Id == result.InvoiceId.Value && i.GrossAmount == 500.00m);
    }

    [Fact]
    public void F8_T4_PaidAppointment_SwitchToPostpaid_PreservesPaidStatus()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Valeriano Hernandez",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Paid,
            PaidAmount = 400.00m
        };

        var invoices = new List<Invoice>();

        var result = PaymentPolicySwitchEngine.SwitchPolicy(apt, "Postpaid", invoices);

        result.UpdatedStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        apt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
    }

    [Fact]
    public void F8_T5_OverriddenAppointment_SwitchToPrepaid_RetainsOverriddenStatus()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Severino Reyes",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Overridden,
            IsEmergencyOverride = true
        };

        var invoices = new List<Invoice>();

        var result = PaymentPolicySwitchEngine.SwitchPolicy(apt, "Prepaid", invoices);

        result.UpdatedStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        apt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
    }
}
