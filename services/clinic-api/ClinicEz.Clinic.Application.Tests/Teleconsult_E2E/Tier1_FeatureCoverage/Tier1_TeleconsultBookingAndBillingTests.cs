using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Tier1_FeatureCoverage;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Tier 1: Feature Coverage for F3 (Teleconsult Appointment Creation & Billing),
/// F4 (AppointmentDto Teleconsult Metadata), and F5 (Cashier Payment Clearance).
/// Minimum 5 tests per feature (15 tests total).
/// </summary>
public class Tier1_TeleconsultBookingAndBillingTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-billing-t1";
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _doctorId = Guid.NewGuid();

    // =========================================================================
    // Feature 3: Teleconsult Appointment Creation & Billing
    // =========================================================================

    [Fact]
    public void F3_T1_CreateTeleconsultAppointment_AssignsNonEmptyCallId()
    {
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var req = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Jose Rizal",
            DateTime.UtcNow.AddDays(1), 30, AppointmentType: "Teleconsult");

        var result = BookingAndBillingEngine.CreateAppointment(req, settings, appointments, invoices, events);

        result.CallId.Should().NotBeEmpty();
        result.IsTeleconsult.Should().BeTrue();
        appointments.Should().ContainSingle(a => a.CallId == result.CallId);
    }

    [Fact]
    public void F3_T2_CreateTeleconsultAppointment_ExplicitPolicyOverridesFacilityDefault()
    {
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId, TeleconsultPaymentPolicy: "Prepaid");
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var req = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Andres Bonifacio",
            DateTime.UtcNow.AddDays(1), 30, AppointmentType: "Teleconsult", PaymentPolicy: "Exempt");

        var result = BookingAndBillingEngine.CreateAppointment(req, settings, appointments, invoices, events);

        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        invoices.Should().BeEmpty();
    }

    [Fact]
    public void F3_T3_CreateTeleconsultAppointment_ResolvesFacilityPolicyWhenOmitted()
    {
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId, TeleconsultPaymentPolicy: "Postpaid");
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var req = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Emilio Aguinaldo",
            DateTime.UtcNow.AddDays(1), 30, AppointmentType: "Teleconsult");

        var result = BookingAndBillingEngine.CreateAppointment(req, settings, appointments, invoices, events);

        result.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Postpaid);
        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
    }

    [Fact]
    public void F3_T4_PrepaidAppointment_CreatesLinkedInvoiceWithCorrectAmount()
    {
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId, TeleconsultDefaultFee: 500.00m);
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var req = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Juan Luna",
            DateTime.UtcNow.AddDays(1), 30, AppointmentType: "Teleconsult", PaymentPolicy: "Prepaid");

        var result = BookingAndBillingEngine.CreateAppointment(req, settings, appointments, invoices, events);

        result.InvoiceId.Should().NotBeNull();
        result.BilledAmount.Should().Be(500.00m);
        invoices.Should().ContainSingle(i => i.Id == result.InvoiceId.Value && i.GrossAmount == 500.00m);
    }

    [Fact]
    public void F3_T5_PrepaidAppointmentInCashierCounterMode_EnqueuesBillingInvoiceRequested()
    {
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var req = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Apolinario Mabini",
            DateTime.UtcNow.AddDays(1), 30, AppointmentType: "Teleconsult", CashierMode: "CashierCounter");

        var result = BookingAndBillingEngine.CreateAppointment(req, settings, appointments, invoices, events);

        result.BillingEventEnqueued.Should().BeTrue();
        events.Should().Contain(e => e.StartsWith("billing.invoice.requested:"));
    }

    // =========================================================================
    // Feature 4: AppointmentDto Teleconsult Metadata
    // =========================================================================

    [Fact]
    public void F4_T1_Projection_ExposesAppointmentTypeAndIsTeleconsult()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Antonio Luna",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult
        };

        var dto = MetadataProjectionEngine.Project(apt);

        dto.AppointmentType.Should().Be("Teleconsult");
        dto.IsTeleconsult.Should().BeTrue();
    }

    [Fact]
    public void F4_T2_Projection_ExposesPaymentPolicyAndStatus()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Marcelo Del Pilar",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending
        };

        var dto = MetadataProjectionEngine.Project(apt);

        dto.PaymentPolicy.Should().Be("Prepaid");
        dto.PaymentStatus.Should().Be("Pending");
    }

    [Fact]
    public void F4_T3_Projection_ExposesInvoiceIdAndPaidAmount()
    {
        var invoiceId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Melchora Aquino",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            InvoiceId = invoiceId,
            PaidAmount = 450.00m
        };

        var dto = MetadataProjectionEngine.Project(apt);

        dto.InvoiceId.Should().Be(invoiceId);
        dto.PaidAmount.Should().Be(450.00m);
    }

    [Fact]
    public void F4_T4_Projection_ExposesCallIdAndAdmittedAtUtc()
    {
        var callId = Guid.NewGuid();
        var admitted = DateTime.UtcNow;
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Diego Silang",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            AdmittedAtUtc = admitted
        };

        var dto = MetadataProjectionEngine.Project(apt);

        dto.CallId.Should().Be(callId);
        dto.AdmittedAtUtc.Should().Be(admitted);
    }

    [Fact]
    public void F4_T5_Projection_ExposesEmergencyOverrideMetadata()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Gabriela Silang",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            IsEmergencyOverride = true,
            EmergencyOverrideReasonCode = "STAFF-OVERRIDE"
        };

        var dto = MetadataProjectionEngine.Project(apt);

        dto.IsEmergencyOverride.Should().BeTrue();
        dto.EmergencyOverrideReasonCode.Should().Be("STAFF-OVERRIDE");
    }

    // =========================================================================
    // Feature 5: Cashier Payment Clearance
    // =========================================================================

    [Fact]
    public void F5_T1_RecordPayment_MarksAppointmentPaymentStatusAsPaid()
    {
        var invoiceId = Guid.NewGuid();
        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();

        var invoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-2026-001",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientName = "Juan Sumulong",
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
            PatientName = "Juan Sumulong",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
            PaymentStatus = TeleconsultPaymentStatus.Pending,
            InvoiceId = invoiceId,
            CallId = callId
        };

        var cmd = new CashierPaymentCommandDto(invoiceId, aptId, 400.00m, "GCash", "RCP-88219", Guid.NewGuid(), DateTime.UtcNow);
        var events = new List<string>();

        var result = CashierPaymentEngine.RecordPayment(cmd, new List<Invoice> { invoice }, new List<Appointment> { apt }, events);

        result.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        apt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
    }

    [Fact]
    public void F5_T2_RecordPayment_SetsPaidAmountPaidAtAndReceiptNumber()
    {
        var invoiceId = Guid.NewGuid();
        var aptId = Guid.NewGuid();
        var paidAt = DateTime.UtcNow;

        var invoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-2026-002",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientName = "Gregorio Del Pilar",
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
            PatientName = "Gregorio Del Pilar",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            InvoiceId = invoiceId,
            CallId = Guid.NewGuid()
        };

        var cmd = new CashierPaymentCommandDto(invoiceId, aptId, 400.00m, "Cash", "RCP-11920", Guid.NewGuid(), paidAt);
        var events = new List<string>();

        var result = CashierPaymentEngine.RecordPayment(cmd, new List<Invoice> { invoice }, new List<Appointment> { apt }, events);

        result.PaidAmount.Should().Be(400.00m);
        result.PaidAt.Should().Be(paidAt);
        result.ReceiptNumber.Should().Be("RCP-11920");
    }

    [Fact]
    public void F5_T3_RecordPayment_PreservesPaymentMethod()
    {
        var invoiceId = Guid.NewGuid();
        var aptId = Guid.NewGuid();

        var invoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-2026-003",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientName = "Francisco Baltazar",
            GrossAmount = 450.00m,
            NetAmount = 450.00m,
            Status = InvoiceStatus.Draft
        };

        var apt = new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Francisco Baltazar",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            InvoiceId = invoiceId,
            CallId = Guid.NewGuid()
        };

        var cmd = new CashierPaymentCommandDto(invoiceId, aptId, 450.00m, "Maya", "RCP-3341", Guid.NewGuid(), DateTime.UtcNow);
        var events = new List<string>();

        var result = CashierPaymentEngine.RecordPayment(cmd, new List<Invoice> { invoice }, new List<Appointment> { apt }, events);

        result.PaymentMethod.Should().Be("Maya");
        apt.PaymentMethod.Should().Be("Maya");
    }

    [Fact]
    public void F5_T4_RecordPayment_DispatchesCommsCallPaymentClearedEvent()
    {
        var invoiceId = Guid.NewGuid();
        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();

        var invoice = new Invoice
        {
            Id = invoiceId,
            InvoiceNumber = "INV-2026-004",
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = aptId,
            PatientName = "Claro M Recto",
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
            PatientName = "Claro M Recto",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            InvoiceId = invoiceId,
            CallId = callId
        };

        var cmd = new CashierPaymentCommandDto(invoiceId, aptId, 400.00m, "Cash", "RCP-5561", Guid.NewGuid(), DateTime.UtcNow);
        var events = new List<string>();

        var result = CashierPaymentEngine.RecordPayment(cmd, new List<Invoice> { invoice }, new List<Appointment> { apt }, events);

        result.CommsPaymentClearedEnqueued.Should().BeTrue();
        events.Should().Contain(e => e.StartsWith($"comms.call.payment.cleared:{callId}:RCP-5561"));
    }

    [Fact]
    public void F5_T5_RecordPayment_NonExistentInvoice_ThrowsKeyNotFoundException()
    {
        var cmd = new CashierPaymentCommandDto(Guid.NewGuid(), Guid.NewGuid(), 400.00m, "Cash", "RCP-NONE", Guid.NewGuid(), DateTime.UtcNow);
        var events = new List<string>();

        var act = () => CashierPaymentEngine.RecordPayment(cmd, new List<Invoice>(), new List<Appointment>(), events);

        act.Should().Throw<KeyNotFoundException>();
    }
}
