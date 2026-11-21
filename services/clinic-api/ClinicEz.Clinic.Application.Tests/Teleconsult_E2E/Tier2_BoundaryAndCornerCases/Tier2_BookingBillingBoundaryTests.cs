using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Tier2_BoundaryAndCornerCases;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Tier 2: Boundary and Corner Cases for F3 (Booking & Billing),
/// F4 (Metadata Projection), and F5 (Cashier Clearance).
/// Minimum 5 tests per feature (15 tests total).
/// </summary>
public class Tier2_BookingBillingBoundaryTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-billing-t2";
    private readonly Guid _patientId = Guid.NewGuid();

    // =========================================================================
    // Feature 3: Booking & Billing Boundaries
    // =========================================================================

    [Fact]
    public void F3_B1_ZeroFeePrepaid_CreatesZeroAmountInvoiceWithoutError()
    {
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId, TeleconsultDefaultFee: 0.00m);
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var req = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Pro Bono Patient",
            DateTime.UtcNow.AddDays(1), 30, AppointmentType: "Teleconsult", PaymentPolicy: "Prepaid");

        var result = BookingAndBillingEngine.CreateAppointment(req, settings, appointments, invoices, events);

        result.BilledAmount.Should().Be(0.00m);
        invoices.Should().ContainSingle(i => i.GrossAmount == 0.00m);
    }

    [Fact]
    public void F3_B2_ExtremeHighFee_CalculatesAccuratelyWithoutOverflow()
    {
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId, TeleconsultDefaultFee: 99999.99m);
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var req = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "VIP Executive",
            DateTime.UtcNow.AddDays(1), 60, AppointmentType: "Teleconsult", PaymentPolicy: "Prepaid");

        var result = BookingAndBillingEngine.CreateAppointment(req, settings, appointments, invoices, events);

        result.BilledAmount.Should().Be(99999.99m);
        invoices[0].GrossAmount.Should().Be(99999.99m);
    }

    [Fact]
    public void F3_B3_FractionalCentsFee_MaintainsExactDecimalPrecision()
    {
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId, TeleconsultDefaultFee: 450.75m);
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var req = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Decimal Patient",
            DateTime.UtcNow.AddDays(1), 30, AppointmentType: "Teleconsult", PaymentPolicy: "Prepaid");

        var result = BookingAndBillingEngine.CreateAppointment(req, settings, appointments, invoices, events);

        result.BilledAmount.Should().Be(450.75m);
        invoices[0].GrossAmount.Should().Be(450.75m);
    }

    [Fact]
    public void F3_B4_PostpaidTeleconsultAppointment_DoesNotGenerateInvoiceUpfront()
    {
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var req = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Postpaid Patient",
            DateTime.UtcNow.AddDays(1), 30, AppointmentType: "Teleconsult", PaymentPolicy: "Postpaid");

        var result = BookingAndBillingEngine.CreateAppointment(req, settings, appointments, invoices, events);

        result.InvoiceId.Should().BeNull();
        result.BilledAmount.Should().BeNull();
        invoices.Should().BeEmpty();
    }

    [Fact]
    public void F3_B5_InvalidPaymentPolicyString_ThrowsArgumentException()
    {
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var req = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Invalid Policy Patient",
            DateTime.UtcNow.AddDays(1), 30, AppointmentType: "Teleconsult", PaymentPolicy: "InstallmentPlan");

        var act = () => BookingAndBillingEngine.CreateAppointment(req, settings, appointments, invoices, events);

        act.Should().Throw<ArgumentException>()
            .WithMessage("*Invalid payment policy*");
    }

    // =========================================================================
    // Feature 4: Metadata Projection Edge Cases
    // =========================================================================

    [Fact]
    public void F4_B1_InPersonAppointment_ProjectsNullCallIdWithoutError()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "InPerson Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.InPerson,
            CallId = null
        };

        var dto = MetadataProjectionEngine.Project(apt);

        dto.IsTeleconsult.Should().BeFalse();
        dto.CallId.Should().BeNull();
    }

    [Fact]
    public void F4_B2_UnbilledAppointment_ProjectsNullInvoiceIdAndNullPaidAmount()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Unbilled Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            InvoiceId = null,
            PaidAmount = null
        };

        var dto = MetadataProjectionEngine.Project(apt);

        dto.InvoiceId.Should().BeNull();
        dto.PaidAmount.Should().BeNull();
    }

    [Fact]
    public void F4_B3_UnadmittedAppointment_ProjectsNullAdmittedAtUtc()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Waiting Room Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            AdmittedAtUtc = null
        };

        var dto = MetadataProjectionEngine.Project(apt);

        dto.AdmittedAtUtc.Should().BeNull();
    }

    [Fact]
    public void F4_B4_NonOverriddenAppointment_ProjectsFalseAndNullReasonCode()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Standard Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            IsEmergencyOverride = false,
            EmergencyOverrideReasonCode = null
        };

        var dto = MetadataProjectionEngine.Project(apt);

        dto.IsEmergencyOverride.Should().BeFalse();
        dto.EmergencyOverrideReasonCode.Should().BeNull();
    }

    [Fact]
    public void F4_B5_SpecialStatusAppointment_PreservesTeleconsultIntegrity()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Completed Teleconsult Patient",
            ScheduledAt = DateTime.UtcNow,
            Status = AppointmentStatus.Completed,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt,
            CallId = Guid.NewGuid()
        };

        var dto = MetadataProjectionEngine.Project(apt);

        dto.PaymentPolicy.Should().Be("Exempt");
        dto.PaymentStatus.Should().Be("Exempt");
        dto.CallId.Should().NotBeNull();
    }

    // =========================================================================
    // Feature 5: Cashier Clearance Edge Cases
    // =========================================================================

    [Fact]
    public void F5_B1_IdempotentPaymentExecution_SecondPaymentPreservesPaidStatus()
    {
        var invoiceId = Guid.NewGuid();
        var aptId = Guid.NewGuid();

        var invoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-T2-001",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientName = "Patient Idempotent",
            GrossAmount = 400.00m,
            NetAmount = 400.00m,
            Status = InvoiceStatus.Draft
        };

        var apt = new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Patient Idempotent",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            InvoiceId = invoiceId,
            CallId = Guid.NewGuid()
        };

        var invoices = new List<Invoice> { invoice };
        var appointments = new List<Appointment> { apt };
        var events = new List<string>();

        var cmd1 = new CashierPaymentCommandDto(invoiceId, aptId, 400.00m, "Cash", "RCP-FIRST", Guid.NewGuid(), DateTime.UtcNow);
        var cmd2 = new CashierPaymentCommandDto(invoiceId, aptId, 400.00m, "Cash", "RCP-SECOND", Guid.NewGuid(), DateTime.UtcNow.AddMinutes(1));

        CashierPaymentEngine.RecordPayment(cmd1, invoices, appointments, events);
        var res2 = CashierPaymentEngine.RecordPayment(cmd2, invoices, appointments, events);

        res2.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        apt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        events.Should().HaveCount(2);
    }

    [Fact]
    public void F5_B2_Overpayment_RecordsExactSubmittedAmount()
    {
        var invoiceId = Guid.NewGuid();
        var aptId = Guid.NewGuid();

        var invoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-T2-002",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientName = "Generous Patient",
            GrossAmount = 400.00m,
            NetAmount = 400.00m,
            Status = InvoiceStatus.Draft
        };

        var apt = new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Generous Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            InvoiceId = invoiceId,
            CallId = Guid.NewGuid()
        };

        var cmd = new CashierPaymentCommandDto(invoiceId, aptId, 500.00m, "Cash", "RCP-OVER", Guid.NewGuid(), DateTime.UtcNow);
        var events = new List<string>();

        var result = CashierPaymentEngine.RecordPayment(cmd, new List<Invoice> { invoice }, new List<Appointment> { apt }, events);

        result.PaidAmount.Should().Be(500.00m);
        apt.PaidAmount.Should().Be(500.00m);
    }

    [Fact]
    public void F5_B3_ZeroAmountPayment_SucceedsForZeroCostInvoices()
    {
        var invoiceId = Guid.NewGuid();
        var aptId = Guid.NewGuid();

        var invoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-T2-003",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientName = "Charity Patient",
            GrossAmount = 0.00m,
            NetAmount = 0.00m,
            Status = InvoiceStatus.Draft
        };

        var apt = new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Charity Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            InvoiceId = invoiceId,
            CallId = Guid.NewGuid()
        };

        var cmd = new CashierPaymentCommandDto(invoiceId, aptId, 0.00m, "Cash", "RCP-ZERO", Guid.NewGuid(), DateTime.UtcNow);
        var events = new List<string>();

        var result = CashierPaymentEngine.RecordPayment(cmd, new List<Invoice> { invoice }, new List<Appointment> { apt }, events);

        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        result.PaidAmount.Should().Be(0.00m);
    }

    [Fact]
    public void F5_B4_PaymentWithSpecialCharactersInReceiptNumber_PreservesExactString()
    {
        var invoiceId = Guid.NewGuid();
        var aptId = Guid.NewGuid();

        var invoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-T2-004",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientName = "Special Char Patient",
            GrossAmount = 400.00m,
            NetAmount = 400.00m,
            Status = InvoiceStatus.Draft
        };

        var apt = new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Special Char Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            InvoiceId = invoiceId,
            CallId = Guid.NewGuid()
        };

        string receiptWithSpecials = "RCP#2026/11-A_@99!";
        var cmd = new CashierPaymentCommandDto(invoiceId, aptId, 400.00m, "DebitCard", receiptWithSpecials, Guid.NewGuid(), DateTime.UtcNow);
        var events = new List<string>();

        var result = CashierPaymentEngine.RecordPayment(cmd, new List<Invoice> { invoice }, new List<Appointment> { apt }, events);

        result.ReceiptNumber.Should().Be(receiptWithSpecials);
        events.Should().Contain(e => e.Contains(receiptWithSpecials));
    }

    [Fact]
    public void F5_B5_PaymentForUnknownAppointment_ThrowsKeyNotFoundException()
    {
        var invoiceId = Guid.NewGuid();
        var nonExistentAptId = Guid.NewGuid();

        var invoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-T2-005",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = nonExistentAptId,
            PatientName = "Ghost Patient",
            GrossAmount = 400.00m,
            NetAmount = 400.00m,
            Status = InvoiceStatus.Draft
        };

        var cmd = new CashierPaymentCommandDto(invoiceId, nonExistentAptId, 400.00m, "Cash", "RCP-ERR", Guid.NewGuid(), DateTime.UtcNow);
        var events = new List<string>();

        var act = () => CashierPaymentEngine.RecordPayment(cmd, new List<Invoice> { invoice }, new List<Appointment>(), events);

        act.Should().Throw<KeyNotFoundException>()
            .WithMessage($"*{invoiceId}*");
    }
}
