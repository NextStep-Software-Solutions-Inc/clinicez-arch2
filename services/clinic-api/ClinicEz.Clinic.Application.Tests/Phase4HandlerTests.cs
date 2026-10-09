using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class RxStatusChangedHandlerTests
{
    private const string Tenant = "tenant-a";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();

    private RxStatusChangedHandler Handler() =>
        new(_db, MessagingTestKit.Recipient(_db), NullLogger<RxStatusChangedHandler>.Instance);

    private ConsultationEncounter SeedRx(Guid? clinicId = null)
    {
        MessagingTestKit.SeedClinic(_db, clinicId ?? _clinicId, Tenant);
        var rx = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = Tenant,
            ClinicId = clinicId ?? _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            DoctorName = "Dr. Reyes"
        };
        _db.Consultations.Add(rx);
        _db.SaveChanges();
        return rx;
    }

    private static RxStatusChangedPayload Payload(ConsultationEncounter rx, Party pharmacy, RxStage stage, DateTime? changedAt = null) =>
        new()
        {
            PrescriptionId = rx.Id,
            OrderingTenantId = rx.TenantId,
            OrderingFacilityId = rx.ClinicId.ToString(),
            PharmacyTenantId = pharmacy.TenantId!,
            PharmacyFacilityId = pharmacy.FacilityId!,
            PharmacyName = "Botica Central",
            Stage = stage,
            QuotedAmount = 320m,
            Reason = stage == RxStage.Rejected ? "out of stock" : null,
            ChangedAtUtc = changedAt ?? DateTime.UtcNow
        };

    private Task Deliver(RxStatusChangedPayload payload, Party from, Guid? correlation = null, Guid? clinicId = null) =>
        Handler().HandleAsync(payload,
            MessagingTestKit.Delivered(InteropTypes.RxStatusChanged, from, MessagingTestKit.ClinicParty(Tenant, clinicId ?? _clinicId),
                correlation ?? payload.PrescriptionId, payload),
            CancellationToken.None);

    private Task<ConsultationEncounter> Reload(ConsultationEncounter rx) =>
        _db.Consultations.IgnoreQueryFilters().SingleAsync(e => e.Id == rx.Id);

    [Fact]
    public async Task Applies_The_Stage_Quote_Reason_And_Pharmacy()
    {
        var rx = SeedRx();
        var pharmacy = MessagingTestKit.PharmacyParty();

        await Deliver(Payload(rx, pharmacy, RxStage.Rejected), pharmacy);

        var saved = await Reload(rx);
        saved.RxStage.Should().Be(RxStage.Rejected);
        saved.RxStageReason.Should().Be("out of stock");
        saved.RxQuotedAmount.Should().Be(320m);
        saved.RxPharmacyName.Should().Be("Botica Central");
        saved.RxPharmacyFacilityId.Should().Be(pharmacy.FacilityId);
        saved.RxPharmacyTenantId.Should().Be(pharmacy.TenantId);
        saved.RxStageReportedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Keeps_The_Dispense_Record_Behaviour_Untouched()
    {
        var rx = SeedRx();
        var pharmacy = MessagingTestKit.PharmacyParty();

        await Deliver(Payload(rx, pharmacy, RxStage.Dispensed), pharmacy);

        (await Reload(rx)).RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.Issued, "rx.dispensed owns the dispense record");
    }

    [Fact]
    public async Task Is_Idempotent_On_Redelivery()
    {
        var rx = SeedRx();
        var pharmacy = MessagingTestKit.PharmacyParty();
        var payload = Payload(rx, pharmacy, RxStage.Accepted);

        await Deliver(payload, pharmacy);
        await Deliver(payload, pharmacy);

        (await Reload(rx)).RxStage.Should().Be(RxStage.Accepted);
    }

    [Fact]
    public async Task Ignores_A_Stale_Stage_Report()
    {
        var rx = SeedRx();
        var pharmacy = MessagingTestKit.PharmacyParty();
        var now = DateTime.UtcNow;

        await Deliver(Payload(rx, pharmacy, RxStage.Dispensed, changedAt: now), pharmacy);
        await Deliver(Payload(rx, pharmacy, RxStage.Accepted, changedAt: now.AddMinutes(-5)), pharmacy);

        (await Reload(rx)).RxStage.Should().Be(RxStage.Dispensed);
    }

    [Fact]
    public async Task A_Newer_Report_Without_A_Quote_Keeps_The_Last_Quote()
    {
        var rx = SeedRx();
        var pharmacy = MessagingTestKit.PharmacyParty();
        var now = DateTime.UtcNow;

        await Deliver(Payload(rx, pharmacy, RxStage.Accepted, changedAt: now), pharmacy);
        await Deliver(Payload(rx, pharmacy, RxStage.Dispensed, changedAt: now.AddMinutes(1)) with { QuotedAmount = null }, pharmacy);

        var saved = await Reload(rx);
        saved.RxStage.Should().Be(RxStage.Dispensed);
        saved.RxQuotedAmount.Should().Be(320m);
    }

    [Fact]
    public async Task Ignores_A_Sender_That_Is_Not_A_Pharmacy()
    {
        var rx = SeedRx();
        var lab = MessagingTestKit.LabParty();

        await Deliver(Payload(rx, lab, RxStage.Accepted), lab);

        (await Reload(rx)).RxStage.Should().Be(RxStage.Issued);
    }

    [Fact]
    public async Task Ignores_A_Payload_Naming_Another_Pharmacy_Than_The_Sender()
    {
        var rx = SeedRx();
        var sender = MessagingTestKit.PharmacyParty();
        var someoneElse = MessagingTestKit.PharmacyParty();

        await Deliver(Payload(rx, someoneElse, RxStage.Accepted), sender);

        (await Reload(rx)).RxStage.Should().Be(RxStage.Issued);
    }

    [Fact]
    public async Task Ignores_A_Payload_Naming_Another_Ordering_Clinic()
    {
        var rx = SeedRx();
        var pharmacy = MessagingTestKit.PharmacyParty();

        await Deliver(Payload(rx, pharmacy, RxStage.Accepted) with { OrderingFacilityId = Guid.NewGuid().ToString() }, pharmacy);
        await Deliver(Payload(rx, pharmacy, RxStage.Accepted) with { OrderingTenantId = "tenant-b" }, pharmacy);

        (await Reload(rx)).RxStage.Should().Be(RxStage.Issued);
    }

    [Fact]
    public async Task Ignores_A_Mismatched_Correlation_And_An_Unknown_Prescription()
    {
        var rx = SeedRx();
        var pharmacy = MessagingTestKit.PharmacyParty();

        await Deliver(Payload(rx, pharmacy, RxStage.Accepted), pharmacy, correlation: Guid.NewGuid());
        await Deliver(Payload(rx, pharmacy, RxStage.Accepted) with { PrescriptionId = Guid.NewGuid() }, pharmacy);

        (await Reload(rx)).RxStage.Should().Be(RxStage.Issued);
    }

    [Fact]
    public async Task Never_Touches_A_Prescription_Of_Another_Clinic_With_The_Same_Id()
    {
        var otherRx = SeedRx(Guid.NewGuid());
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        var pharmacy = MessagingTestKit.PharmacyParty();

        await Deliver(Payload(otherRx, pharmacy, RxStage.Accepted) with { OrderingFacilityId = _clinicId.ToString() }, pharmacy);

        (await Reload(otherRx)).RxStage.Should().Be(RxStage.Issued);
    }
}

public class BillingInvoiceVoidedHandlerTests
{
    private const string Tenant = "tenant-a";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();

    private BillingInvoiceVoidedHandler Handler() =>
        new(_db, MessagingTestKit.Recipient(_db), NullLogger<BillingInvoiceVoidedHandler>.Instance);

    private Party Counter(Guid? clinicId = null) =>
        Party.ForFacility(Tenant, (clinicId ?? _clinicId).ToString(), FacilityType.Clinic, InteropServices.Billing);

    private Invoice SeedInvoice(decimal net = 1000m, decimal paid = 0m, Guid? clinicId = null, InvoiceStatus? status = null)
    {
        var id = clinicId ?? _clinicId;
        MessagingTestKit.SeedClinic(_db, id, Tenant);
        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = Tenant,
            ClinicId = id,
            InvoiceNumber = "INV-1",
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            GrossAmount = net,
            NetAmount = net,
            AmountPaid = paid,
            BalanceDue = net - paid,
            BillingRequestedAt = DateTime.UtcNow,
            Status = status ?? (paid >= net ? InvoiceStatus.Paid : paid > 0 ? InvoiceStatus.PartiallyPaid : InvoiceStatus.Draft)
        };
        if (paid > 0)
        {
            invoice.Payments.Add(new PaymentRecord
            {
                InvoiceId = invoice.Id,
                TenantId = Tenant,
                ClinicId = id,
                PaymentNumber = "OR-1",
                Amount = paid,
                Method = PaymentMethod.GCash
            });
        }
        _db.Invoices.Add(invoice);
        _db.SaveChanges();
        return invoice;
    }

    private Task Deliver(Invoice invoice, BillingCorrectionKind kind, Party from, decimal reversed = 0m, Guid? correlation = null, Guid? clinicId = null)
    {
        var payload = new BillingInvoiceVoidedPayload
        {
            TenantId = Tenant,
            FacilityId = (clinicId ?? _clinicId).ToString(),
            FacilityType = FacilityType.Clinic,
            InvoiceId = Guid.NewGuid(),
            InvoiceRequestId = invoice.Id,
            SourceType = "Consultation",
            SourceId = invoice.Id,
            Kind = kind,
            Total = invoice.NetAmount,
            AmountReversed = reversed,
            WasFullyPaid = reversed >= invoice.NetAmount
        };
        return Handler().HandleAsync(payload,
            MessagingTestKit.Delivered(InteropTypes.BillingInvoiceVoided, from, MessagingTestKit.ClinicParty(Tenant, clinicId ?? _clinicId),
                correlation ?? invoice.Id, payload),
            CancellationToken.None);
    }

    private Task<Invoice> Reload(Invoice invoice) =>
        _db.Invoices.IgnoreQueryFilters().Include(i => i.Payments).SingleAsync(i => i.Id == invoice.Id);

    [Fact]
    public async Task Void_Of_An_Unpaid_Invoice_Marks_It_Voided_With_Nothing_Owed()
    {
        var invoice = SeedInvoice();

        await Deliver(invoice, BillingCorrectionKind.Void, Counter());

        var saved = await Reload(invoice);
        saved.Status.Should().Be(InvoiceStatus.Voided);
        saved.BalanceDue.Should().Be(0m);
        saved.AmountPaid.Should().Be(0m);
        saved.Payments.Should().BeEmpty();
    }

    [Fact]
    public async Task Refund_Marks_The_Invoice_Refunded_And_Books_A_Reversing_Payment()
    {
        var invoice = SeedInvoice(paid: 1000m);

        await Deliver(invoice, BillingCorrectionKind.Refund, Counter(), reversed: 1000m);

        var saved = await Reload(invoice);
        saved.Status.Should().Be(InvoiceStatus.Refunded);
        saved.AmountPaid.Should().Be(0m);
        saved.BalanceDue.Should().Be(0m);
        saved.Payments.Select(p => p.Amount).Should().BeEquivalentTo(new[] { 1000m, -1000m });
        saved.Payments.Sum(p => p.Amount).Should().Be(0m, "collections net out");
        saved.Payments.Single(p => p.Amount < 0).Method.Should().Be(PaymentMethod.GCash);
    }

    [Fact]
    public async Task Redelivery_Changes_Nothing_Further()
    {
        var invoice = SeedInvoice(paid: 600m, net: 1000m);

        await Deliver(invoice, BillingCorrectionKind.Refund, Counter(), reversed: 600m);
        await Deliver(invoice, BillingCorrectionKind.Refund, Counter(), reversed: 600m);
        await Deliver(invoice, BillingCorrectionKind.Void, Counter());

        var saved = await Reload(invoice);
        saved.Status.Should().Be(InvoiceStatus.Refunded);
        saved.Payments.Should().HaveCount(2);
        saved.AmountPaid.Should().Be(0m);
    }

    [Fact]
    public async Task The_Reversal_Never_Exceeds_What_Was_Recorded_As_Paid()
    {
        var invoice = SeedInvoice(paid: 400m);

        await Deliver(invoice, BillingCorrectionKind.Refund, Counter(), reversed: 5000m);

        var saved = await Reload(invoice);
        saved.AmountPaid.Should().Be(0m);
        saved.Payments.Sum(p => p.Amount).Should().Be(0m);
    }

    [Fact]
    public async Task Ignores_A_Sender_That_Is_Not_This_Clinics_Billing_Counter()
    {
        var invoice = SeedInvoice();

        await Deliver(invoice, BillingCorrectionKind.Void, Counter(Guid.NewGuid()));
        await Deliver(invoice, BillingCorrectionKind.Void, Party.ForFacility(Tenant, _clinicId.ToString(), FacilityType.Clinic));
        await Deliver(invoice, BillingCorrectionKind.Void, MessagingTestKit.LabParty());

        (await Reload(invoice)).Status.Should().Be(InvoiceStatus.Draft);
    }

    [Fact]
    public async Task Ignores_A_Mismatched_Correlation_Or_Request_Id()
    {
        var invoice = SeedInvoice();

        await Deliver(invoice, BillingCorrectionKind.Void, Counter(), correlation: Guid.NewGuid());

        (await Reload(invoice)).Status.Should().Be(InvoiceStatus.Draft);
    }

    [Fact]
    public async Task Ignores_An_Unknown_Invoice()
    {
        var invoice = SeedInvoice();
        var other = new Invoice { Id = Guid.NewGuid(), InvoiceNumber = "X", PatientName = "X", NetAmount = 10m };

        await Deliver(other, BillingCorrectionKind.Void, Counter());

        (await Reload(invoice)).Status.Should().Be(InvoiceStatus.Draft);
    }

    [Fact]
    public async Task Never_Touches_An_Invoice_Of_Another_Clinic()
    {
        var otherClinic = Guid.NewGuid();
        var otherInvoice = SeedInvoice(clinicId: otherClinic);
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);

        await Deliver(otherInvoice, BillingCorrectionKind.Void, Counter());

        (await Reload(otherInvoice)).Status.Should().Be(InvoiceStatus.Draft);
    }

    [Fact]
    public async Task A_Payment_Confirmation_After_A_Refund_Does_Not_Reopen_The_Invoice()
    {
        var invoice = SeedInvoice(paid: 1000m);
        await Deliver(invoice, BillingCorrectionKind.Refund, Counter(), reversed: 1000m);
        var late = new BillingPaymentConfirmedPayload { InvoiceRequestId = invoice.Id, AmountDue = 1000m, AmountPaid = 1000m, FullyPaid = true };

        await new BillingPaymentConfirmedHandler(_db, MessagingTestKit.Recipient(_db), NullLogger<BillingPaymentConfirmedHandler>.Instance)
            .HandleAsync(late,
                MessagingTestKit.Delivered(InteropTypes.BillingPaymentConfirmed, Counter(), MessagingTestKit.ClinicParty(Tenant, _clinicId), invoice.Id, late),
                CancellationToken.None);

        var saved = await Reload(invoice);
        saved.Status.Should().Be(InvoiceStatus.Refunded);
        saved.AmountPaid.Should().Be(0m);
    }
}
