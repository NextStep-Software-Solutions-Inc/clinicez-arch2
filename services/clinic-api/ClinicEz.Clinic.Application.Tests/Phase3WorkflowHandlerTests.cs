using System;
using System.Collections.Generic;
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

public class LabOrderStatusChangedHandlerTests
{
    private const string Tenant = "tenant-a";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();

    private LabOrderStatusChangedHandler Handler() =>
        new(_db, MessagingTestKit.Recipient(_db), NullLogger<LabOrderStatusChangedHandler>.Instance);

    private LabOrder SeedOrder(Guid? clinicId = null, Action<LabOrder>? configure = null)
    {
        MessagingTestKit.SeedClinic(_db, clinicId ?? _clinicId, Tenant);
        var order = Phase3TestKit.NewLabOrder(clinicId ?? _clinicId, Tenant, Guid.NewGuid());
        configure?.Invoke(order);
        _db.LabOrders.Add(order);
        _db.SaveChanges();
        return order;
    }

    private static LabOrderStatusChangedPayload Payload(LabOrder order, Party lab, LabOrderStage stage, DateTime? changedAt = null) =>
        new()
        {
            RequisitionId = order.Id,
            OrderingTenantId = order.TenantId,
            OrderingFacilityId = order.ClinicId.ToString(),
            LaboratoryTenantId = lab.TenantId!,
            LaboratoryFacilityId = lab.FacilityId!,
            LaboratoryName = "Metro Diagnostics",
            Stage = stage,
            QuotedAmount = 850m,
            Currency = "PHP",
            PaymentRequired = true,
            Reason = "quoted",
            ChangedAtUtc = changedAt ?? DateTime.UtcNow
        };

    private Task Deliver(LabOrderStatusChangedPayload payload, Party from, Guid? correlation = null, Guid? clinicId = null) =>
        Handler().HandleAsync(payload,
            MessagingTestKit.Delivered(InteropTypes.LabOrderStatusChanged, from, MessagingTestKit.ClinicParty(Tenant, clinicId ?? _clinicId),
                correlation ?? payload.RequisitionId, payload),
            CancellationToken.None);

    [Fact]
    public async Task Applies_The_Stage_Quote_And_Laboratory()
    {
        var order = SeedOrder();
        var lab = MessagingTestKit.LabParty();

        await Deliver(Payload(order, lab, LabOrderStage.AwaitingPayment), lab);

        var saved = await _db.LabOrders.IgnoreQueryFilters().SingleAsync(o => o.Id == order.Id);
        saved.Stage.Should().Be(LabOrderStage.AwaitingPayment);
        saved.QuotedAmount.Should().Be(850m);
        saved.QuotedCurrency.Should().Be("PHP");
        saved.PaymentRequired.Should().BeTrue();
        saved.LaboratoryName.Should().Be("Metro Diagnostics");
        saved.LaboratoryFacilityId.Should().Be(lab.FacilityId);
    }

    [Fact]
    public async Task Is_Idempotent_On_Redelivery()
    {
        var order = SeedOrder();
        var lab = MessagingTestKit.LabParty();
        var payload = Payload(order, lab, LabOrderStage.InProcess);

        await Deliver(payload, lab);
        await Deliver(payload, lab);

        (await _db.LabOrders.IgnoreQueryFilters().SingleAsync(o => o.Id == order.Id)).Stage.Should().Be(LabOrderStage.InProcess);
    }

    [Fact]
    public async Task Ignores_A_Stale_Stage_Report()
    {
        var order = SeedOrder();
        var lab = MessagingTestKit.LabParty();
        var now = DateTime.UtcNow;

        await Deliver(Payload(order, lab, LabOrderStage.InProcess, changedAt: now), lab);
        await Deliver(Payload(order, lab, LabOrderStage.Paid, changedAt: now.AddMinutes(-5)), lab);

        (await _db.LabOrders.IgnoreQueryFilters().SingleAsync(o => o.Id == order.Id)).Stage.Should().Be(LabOrderStage.InProcess);
    }

    [Fact]
    public async Task Ignores_A_Sender_That_Is_Not_A_Laboratory()
    {
        var order = SeedOrder();
        var pharmacy = MessagingTestKit.PharmacyParty();

        await Deliver(Payload(order, pharmacy, LabOrderStage.Paid), pharmacy);

        (await _db.LabOrders.IgnoreQueryFilters().SingleAsync(o => o.Id == order.Id)).Stage.Should().Be(LabOrderStage.Issued);
    }

    [Fact]
    public async Task Ignores_An_Order_Routed_To_A_Different_Laboratory()
    {
        var routedTo = MessagingTestKit.LabParty();
        var order = SeedOrder(configure: o =>
        {
            o.TargetTenantId = routedTo.TenantId;
            o.TargetFacilityId = Guid.Parse(routedTo.FacilityId!);
        });
        var other = MessagingTestKit.LabParty();

        await Deliver(Payload(order, other, LabOrderStage.Paid), other);

        (await _db.LabOrders.IgnoreQueryFilters().SingleAsync(o => o.Id == order.Id)).Stage.Should().Be(LabOrderStage.Issued);
    }

    [Fact]
    public async Task Accepts_The_Laboratory_The_Order_Was_Routed_To()
    {
        var routedTo = MessagingTestKit.LabParty();
        var order = SeedOrder(configure: o =>
        {
            o.TargetTenantId = routedTo.TenantId;
            o.TargetFacilityId = Guid.Parse(routedTo.FacilityId!);
        });

        await Deliver(Payload(order, routedTo, LabOrderStage.Paid), routedTo);

        (await _db.LabOrders.IgnoreQueryFilters().SingleAsync(o => o.Id == order.Id)).Stage.Should().Be(LabOrderStage.Paid);
    }

    [Fact]
    public async Task Ignores_A_Payload_Naming_Another_Ordering_Clinic()
    {
        var order = SeedOrder();
        var lab = MessagingTestKit.LabParty();
        var payload = Payload(order, lab, LabOrderStage.Paid) with { OrderingFacilityId = Guid.NewGuid().ToString() };

        await Deliver(payload, lab);

        (await _db.LabOrders.IgnoreQueryFilters().SingleAsync(o => o.Id == order.Id)).Stage.Should().Be(LabOrderStage.Issued);
    }

    [Fact]
    public async Task Ignores_A_Mismatched_Correlation_And_An_Unknown_Order()
    {
        var order = SeedOrder();
        var lab = MessagingTestKit.LabParty();

        await Deliver(Payload(order, lab, LabOrderStage.Paid), lab, correlation: Guid.NewGuid());
        var unknown = Payload(order, lab, LabOrderStage.Paid) with { RequisitionId = Guid.NewGuid() };
        await Deliver(unknown, lab);

        (await _db.LabOrders.IgnoreQueryFilters().SingleAsync(o => o.Id == order.Id)).Stage.Should().Be(LabOrderStage.Issued);
    }

    [Fact]
    public async Task Never_Touches_An_Order_Of_Another_Clinic_With_The_Same_Id()
    {
        var otherClinic = Guid.NewGuid();
        var otherOrder = SeedOrder(otherClinic);
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        var lab = MessagingTestKit.LabParty();

        await Deliver(Payload(otherOrder, lab, LabOrderStage.Paid) with { OrderingFacilityId = _clinicId.ToString() }, lab);

        (await _db.LabOrders.IgnoreQueryFilters().SingleAsync(o => o.Id == otherOrder.Id)).Stage.Should().Be(LabOrderStage.Issued);
    }
}

public class BillingPaymentConfirmedHandlerTests
{
    private const string Tenant = "tenant-a";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();

    private BillingPaymentConfirmedHandler Handler() =>
        new(_db, MessagingTestKit.Recipient(_db), NullLogger<BillingPaymentConfirmedHandler>.Instance);

    private Party Counter(Guid? clinicId = null) =>
        Party.ForFacility(Tenant, (clinicId ?? _clinicId).ToString(), FacilityType.Clinic, InteropServices.Billing);

    private Invoice SeedInvoice(decimal net = 1000m, InvoiceStatus status = InvoiceStatus.Draft)
    {
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = Tenant,
            ClinicId = _clinicId,
            InvoiceNumber = "INV-1",
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            GrossAmount = net,
            NetAmount = net,
            BalanceDue = net,
            Status = status
        };
        _db.Invoices.Add(invoice);
        _db.SaveChanges();
        return invoice;
    }

    private Task Deliver(Invoice invoice, decimal paid, Party from, bool fullyPaid = false, string? method = "GCash")
    {
        var payload = new BillingPaymentConfirmedPayload
        {
            InvoiceRequestId = invoice.Id,
            InvoiceId = Guid.NewGuid(),
            AmountDue = invoice.NetAmount,
            AmountPaid = paid,
            FullyPaid = fullyPaid,
            PaymentMethod = method,
            ReceiptNumber = "OR-77"
        };
        return Handler().HandleAsync(payload,
            MessagingTestKit.Delivered(InteropTypes.BillingPaymentConfirmed, from, MessagingTestKit.ClinicParty(Tenant, _clinicId), invoice.Id, payload),
            CancellationToken.None);
    }

    private Task<Invoice> Reload(Invoice invoice) =>
        _db.Invoices.IgnoreQueryFilters().Include(i => i.Payments).SingleAsync(i => i.Id == invoice.Id);

    [Fact]
    public async Task Full_Payment_Marks_The_Invoice_Paid_And_Records_The_Receipt()
    {
        var invoice = SeedInvoice();

        await Deliver(invoice, 1000m, Counter(), fullyPaid: true);

        var saved = await Reload(invoice);
        saved.Status.Should().Be(InvoiceStatus.Paid);
        saved.AmountPaid.Should().Be(1000m);
        saved.BalanceDue.Should().Be(0m);
        saved.Payments.Should().ContainSingle().Which.ReferenceNumber.Should().Be("OR-77");
    }

    [Fact]
    public async Task Partial_Payment_Leaves_A_Balance()
    {
        var invoice = SeedInvoice();

        await Deliver(invoice, 400m, Counter());

        var saved = await Reload(invoice);
        saved.Status.Should().Be(InvoiceStatus.PartiallyPaid);
        saved.BalanceDue.Should().Be(600m);
    }

    [Fact]
    public async Task Redelivery_And_Out_Of_Order_Confirmations_Do_Not_Pay_Twice()
    {
        var invoice = SeedInvoice();

        await Deliver(invoice, 700m, Counter());
        await Deliver(invoice, 700m, Counter());
        await Deliver(invoice, 300m, Counter());

        var saved = await Reload(invoice);
        saved.AmountPaid.Should().Be(700m);
        saved.Payments.Should().ContainSingle();
    }

    [Fact]
    public async Task A_Second_Instalment_Adds_Only_The_Difference()
    {
        var invoice = SeedInvoice();

        await Deliver(invoice, 400m, Counter());
        await Deliver(invoice, 1000m, Counter(), fullyPaid: true);

        var saved = await Reload(invoice);
        saved.Payments.Select(p => p.Amount).Should().BeEquivalentTo(new[] { 400m, 600m });
        saved.Status.Should().Be(InvoiceStatus.Paid);
    }

    [Fact]
    public async Task The_Amount_Is_Capped_At_The_Net_Amount()
    {
        var invoice = SeedInvoice();

        await Deliver(invoice, 5000m, Counter());

        (await Reload(invoice)).AmountPaid.Should().Be(1000m);
    }

    [Fact]
    public async Task Ignores_A_Sender_That_Is_Not_This_Clinics_Billing_Counter()
    {
        var invoice = SeedInvoice();

        await Deliver(invoice, 1000m, Counter(Guid.NewGuid()));
        await Deliver(invoice, 1000m, Party.ForFacility(Tenant, _clinicId.ToString(), FacilityType.Clinic));
        await Deliver(invoice, 1000m, MessagingTestKit.LabParty());

        (await Reload(invoice)).AmountPaid.Should().Be(0m);
    }

    [Fact]
    public async Task Ignores_A_Voided_Invoice()
    {
        var invoice = SeedInvoice(status: InvoiceStatus.Voided);

        await Deliver(invoice, 1000m, Counter());

        (await Reload(invoice)).AmountPaid.Should().Be(0m);
    }

    [Fact]
    public async Task Ignores_An_Unknown_Invoice()
    {
        var invoice = SeedInvoice();
        var other = new Invoice { Id = Guid.NewGuid(), InvoiceNumber = "X", PatientName = "X", NetAmount = 10m };

        await Deliver(other, 10m, Counter());

        (await Reload(invoice)).AmountPaid.Should().Be(0m);
    }
}

public class PatientShareSnapshotHandlerTests
{
    private const string Tenant = "tenant-a";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _patientPlaneId = Guid.NewGuid();
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();

    private PatientShareSnapshotHandler Handler() =>
        new(_db, MessagingTestKit.Recipient(_db), NullLogger<PatientShareSnapshotHandler>.Instance);

    private ShareImport SeedImport(bool addToQueue = false, string? complaint = null)
    {
        if (!_db.Settings.IgnoreQueryFilters().Any(c => c.ClinicId == _clinicId))
        {
            MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        }
        var import = new ShareImport
        {
            Id = Guid.NewGuid(),
            TenantId = Tenant,
            ClinicId = _clinicId,
            AddToQueue = addToQueue,
            ChiefComplaint = complaint
        };
        _db.ShareImports.Add(import);
        _db.SaveChanges();
        return import;
    }

    private PatientShareSnapshotPayload Snapshot(
        SharingScopes scopes,
        bool granted = true,
        bool withDemographics = true,
        ShareDenialCode? denialCode = null,
        Guid? grantId = null,
        int redemptionNumber = 0,
        int maxRedemptions = 0,
        bool isRefresh = false) =>
        new()
        {
            Granted = granted,
            DenialReason = granted ? null : "Patient declined",
            DenialCode = denialCode,
            RedemptionNumber = redemptionNumber,
            MaxRedemptions = maxRedemptions,
            IsRefresh = isRefresh,
            GrantId = grantId ?? Guid.NewGuid(),
            PatientId = _patientPlaneId,
            ClinicEzId = "CEZ-1234",
            Scopes = scopes,
            ExpiresAtUtc = DateTime.UtcNow.AddHours(1),
            Demographics = withDemographics
                ? new ShareDemographicsDto
                {
                    FirstName = "Maria",
                    MiddleName = "Luisa",
                    LastName = "Santos",
                    FullName = "Maria Luisa Santos",
                    DateOfBirth = "1984-03-12",
                    Sex = "F",
                    MobileNumber = "0917-000-1111"
                }
                : null,
            Items = new List<ShareItemDto>
            {
                new() { Kind = "allergy", Name = "Penicillin" },
                new() { Kind = "condition", Name = "Asthma" },
                new() { Kind = "medication", Name = "Salbutamol" },
                new() { Kind = "vital", Name = "BP", Detail = "120/80" }
            }
        };

    private Task Deliver(ShareImport import, PatientShareSnapshotPayload payload, Party? from = null) =>
        Handler().HandleAsync(payload,
            MessagingTestKit.Delivered(InteropTypes.PatientShareSnapshot, from ?? Party.ForPatient(_patientPlaneId.ToString()),
                MessagingTestKit.ClinicParty(Tenant, _clinicId), import.Id, payload),
            CancellationToken.None);

    private Task<ShareImport> Reload(ShareImport import) =>
        _db.ShareImports.IgnoreQueryFilters().SingleAsync(i => i.Id == import.Id);

    [Fact]
    public async Task Imports_Only_The_Granted_Scopes_For_A_New_Patient()
    {
        var import = SeedImport();

        await Deliver(import, Snapshot(SharingScopes.Demographics | SharingScopes.Allergies));

        var saved = await Reload(import);
        saved.Status.Should().Be(ShareImportStatus.Imported);
        saved.ItemsImported.Should().Be(2, "one demographics block and the allergy; conditions, medications and vitals were not granted");
        saved.ItemsJson.Should().BeNull();
        saved.PatientName.Should().Be("Maria Luisa Santos");

        var patient = await _db.Patients.IgnoreQueryFilters().Include(p => p.Allergies).Include(p => p.MedicalHistories).SingleAsync(p => p.Id == saved.PatientId);
        patient.ClinicId.Should().Be(_clinicId);
        patient.CloudPatientId.Should().Be(_patientPlaneId);
        patient.ClinicEzId.Should().Be("CEZ-1234");
        patient.FirstName.Should().Be("Maria");
        patient.MiddleName.Should().Be("Luisa");
        patient.LastName.Should().Be("Santos");
        patient.Allergies.Should().Contain(a => a.Allergen == "Penicillin");
        patient.MedicalHistories.Should().BeEmpty();
        patient.ShareGrantScopes.Should().Be(SharingScopes.Demographics | SharingScopes.Allergies);
    }

    [Fact]
    public async Task Keeps_Items_Without_A_Chart_Field_As_The_Imported_Snapshot()
    {
        var import = SeedImport();

        await Deliver(import, Snapshot(SharingScopes.Demographics | SharingScopes.Medications | SharingScopes.Vitals));

        var saved = await Reload(import);
        saved.ItemsJson.Should().Contain("Salbutamol").And.Contain("BP");
    }

    [Fact]
    public async Task A_New_Patient_Without_Demographics_Fails_The_Import()
    {
        var import = SeedImport();

        await Deliver(import, Snapshot(SharingScopes.Allergies, withDemographics: false));

        var saved = await Reload(import);
        saved.Status.Should().Be(ShareImportStatus.Failed);
        saved.DenialReason.Should().Contain("demographics");
        (await _db.Patients.IgnoreQueryFilters().CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Matches_An_Existing_Chart_By_ClinicEzId_Before_The_Patient_Plane_Id()
    {
        var byClinicEzId = Phase3TestKit.NewPatient(_clinicId, Tenant);
        byClinicEzId.ClinicEzId = "CEZ-1234";
        var bySync = Phase3TestKit.NewPatient(_clinicId, Tenant, _patientPlaneId);
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        _db.Patients.AddRange(byClinicEzId, bySync);
        await _db.SaveChangesAsync();
        var import = SeedImport();

        await Deliver(import, Snapshot(SharingScopes.Allergies, withDemographics: false));

        (await Reload(import)).PatientId.Should().Be(byClinicEzId.Id);
    }

    [Fact]
    public async Task Falls_Back_To_The_Patient_Plane_Id_When_The_ClinicEzId_Is_Unknown()
    {
        var bySync = Phase3TestKit.NewPatient(_clinicId, Tenant, _patientPlaneId);
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        _db.Patients.Add(bySync);
        await _db.SaveChangesAsync();
        var import = SeedImport();

        await Deliver(import, Snapshot(SharingScopes.Allergies, withDemographics: false));

        var saved = await Reload(import);
        saved.PatientId.Should().Be(bySync.Id);
        (await _db.Patients.IgnoreQueryFilters().SingleAsync()).ClinicEzId.Should().Be("CEZ-1234");
    }

    [Fact]
    public async Task Does_Not_Match_A_Chart_Of_Another_Clinic()
    {
        var otherClinic = Guid.NewGuid();
        var foreign = Phase3TestKit.NewPatient(otherClinic, Tenant, _patientPlaneId);
        foreign.ClinicEzId = "CEZ-1234";
        _db.Patients.Add(foreign);
        await _db.SaveChangesAsync();
        var import = SeedImport();

        await Deliver(import, Snapshot(SharingScopes.Allergies, withDemographics: false));

        (await Reload(import)).Status.Should().Be(ShareImportStatus.Failed);
        var untouched = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == foreign.Id);
        untouched.Allergies.Should().BeNullOrEmpty();
    }

    [Fact]
    public async Task Adds_The_Patient_To_The_Queue_When_Requested()
    {
        var import = SeedImport(addToQueue: true, complaint: "Cough");

        await Deliver(import, Snapshot(SharingScopes.Demographics));

        var saved = await Reload(import);
        saved.QueueNumber.Should().Be("Q-001");
        var queued = await _db.QueueItems.IgnoreQueryFilters().SingleAsync(q => q.Id == saved.QueueItemId);
        queued.ChiefComplaint.Should().Be("Cough");
        queued.PatientId.Should().Be(saved.PatientId!.Value);
        queued.ClinicId.Should().Be(_clinicId);
    }

    [Fact]
    public async Task A_Denied_Snapshot_Records_The_Reason_And_Creates_No_Chart()
    {
        var import = SeedImport();

        await Deliver(import, Snapshot(SharingScopes.None, granted: false));

        var saved = await Reload(import);
        saved.Status.Should().Be(ShareImportStatus.Denied);
        saved.DenialReason.Should().Be("Patient declined");
        (await _db.Patients.IgnoreQueryFilters().CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task A_Denial_May_Come_From_The_Patient_Control_Plane()
    {
        var import = SeedImport();
        var from = new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient };

        await Deliver(import, Snapshot(SharingScopes.None, granted: false), from);

        (await Reload(import)).Status.Should().Be(ShareImportStatus.Denied);
    }

    [Fact]
    public async Task A_Grant_From_The_Control_Plane_Is_Ignored()
    {
        var import = SeedImport();
        var from = new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient };

        await Deliver(import, Snapshot(SharingScopes.Demographics), from);

        (await Reload(import)).Status.Should().Be(ShareImportStatus.Pending);
    }

    [Fact]
    public async Task Ignores_A_Snapshot_From_A_Different_Patient_Or_A_Facility()
    {
        var import = SeedImport();

        await Deliver(import, Snapshot(SharingScopes.Demographics), Party.ForPatient(Guid.NewGuid().ToString()));
        await Deliver(import, Snapshot(SharingScopes.Demographics), MessagingTestKit.LabParty());

        (await Reload(import)).Status.Should().Be(ShareImportStatus.Pending);
        (await _db.Patients.IgnoreQueryFilters().CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Ignores_An_Unsolicited_Snapshot_And_A_Replay_Of_A_Completed_Import()
    {
        var import = SeedImport();
        var snapshot = Snapshot(SharingScopes.Demographics);
        await Deliver(new ShareImport { Id = Guid.NewGuid(), TenantId = Tenant }, snapshot);
        (await _db.Patients.IgnoreQueryFilters().CountAsync()).Should().Be(0);

        await Deliver(import, snapshot);
        await Deliver(import, snapshot);

        (await _db.Patients.IgnoreQueryFilters().CountAsync()).Should().Be(1);
    }

    [Theory]
    [InlineData(ShareDenialCode.Invalid)]
    [InlineData(ShareDenialCode.Expired)]
    [InlineData(ShareDenialCode.Exhausted)]
    [InlineData(ShareDenialCode.PatientUnknown)]
    [InlineData(ShareDenialCode.RateLimited)]
    [InlineData(ShareDenialCode.Revoked)]
    public async Task A_Denial_Stores_The_Machine_Readable_Code(ShareDenialCode code)
    {
        var import = SeedImport();

        await Deliver(import, Snapshot(SharingScopes.None, granted: false, denialCode: code));

        var saved = await Reload(import);
        saved.Status.Should().Be(ShareImportStatus.Denied);
        saved.DenialCode.Should().Be(code);
    }

    [Fact]
    public async Task An_Import_Keeps_The_Redemption_Counters_And_Leaves_The_Denial_Code_Empty()
    {
        var import = SeedImport();

        await Deliver(import, Snapshot(SharingScopes.Demographics, redemptionNumber: 2, maxRedemptions: 3));

        var saved = await Reload(import);
        saved.RedemptionNumber.Should().Be(2);
        saved.MaxRedemptions.Should().Be(3);
        saved.IsRefresh.Should().BeFalse();
        saved.DenialCode.Should().BeNull();
    }

    [Fact]
    public async Task An_Older_Publisher_Without_Counters_Leaves_Them_Empty()
    {
        var import = SeedImport();

        await Deliver(import, Snapshot(SharingScopes.Demographics));

        var saved = await Reload(import);
        saved.RedemptionNumber.Should().BeNull();
        saved.MaxRedemptions.Should().BeNull();
    }

    [Fact]
    public async Task A_Same_Grant_Refresh_Merges_Into_The_Existing_Chart_Without_Duplicating_Items()
    {
        var grantId = Guid.NewGuid();
        var scopes = SharingScopes.Demographics | SharingScopes.Allergies;
        var first = SeedImport();
        await Deliver(first, Snapshot(scopes, grantId: grantId, redemptionNumber: 1, maxRedemptions: 3));
        var second = SeedImport();

        await Deliver(second, Snapshot(scopes, grantId: grantId, redemptionNumber: 2, maxRedemptions: 3, isRefresh: true));

        var refreshed = await Reload(second);
        refreshed.Status.Should().Be(ShareImportStatus.Imported);
        refreshed.IsRefresh.Should().BeTrue();
        refreshed.GrantId.Should().Be(grantId);
        (await Reload(first)).PatientId.Should().Be(refreshed.PatientId);
        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync();
        patient.ShareGrantId.Should().Be(grantId);
        var allergies = await _db.PatientAllergies.IgnoreQueryFilters().Where(a => a.PatientId == patient.Id).Select(a => a.Allergen).ToListAsync();
        allergies.Should().Contain("Penicillin");
    }

    [Fact]
    public async Task Imports_Patient_With_Compound_Name_Preserving_Given_Name_And_Suffix()
    {
        var import = SeedImport(addToQueue: true, complaint: "Routine Checkup");

        var snapshot = Snapshot(SharingScopes.Demographics);
        snapshot = snapshot with
        {
            Demographics = new ShareDemographicsDto
            {
                FirstName = "Ely An",
                MiddleName = "Dela",
                LastName = "Maureal",
                Suffix = "Jr.",
                FullName = "Ely An Dela Maureal Jr.",
                DateOfBirth = "1994-08-20",
                Sex = "Male",
                MobileNumber = "0917-555-0123"
            }
        };

        await Deliver(import, snapshot);

        var saved = await Reload(import);
        saved.Status.Should().Be(ShareImportStatus.Imported);
        saved.PatientName.Should().Be("Ely An Dela Maureal Jr.");

        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Ely An");
        patient.MiddleName.Should().Be("Dela");
        patient.LastName.Should().Be("Maureal");
        patient.Suffix.Should().Be("Jr.");

        var queueItem = await _db.QueueItems.IgnoreQueryFilters().SingleAsync(q => q.Id == saved.QueueItemId);
        queueItem.PatientName.Should().Be("Ely An Dela Maureal Jr.");
    }

    [Fact]
    public async Task Imports_Patient_With_Backward_Compatible_Fallback_Without_Dropping_Tokens()
    {
        var import = SeedImport();

        var snapshot = Snapshot(SharingScopes.Demographics);
        snapshot = snapshot with
        {
            Demographics = new ShareDemographicsDto
            {
                FirstName = null,
                MiddleName = null,
                LastName = null,
                Suffix = null,
                FullName = "Ely An Maureal",
                DateOfBirth = "1994-08-20",
                Sex = "Male"
            }
        };

        await Deliver(import, snapshot);

        var saved = await Reload(import);
        saved.Status.Should().Be(ShareImportStatus.Imported);
        saved.PatientName.Should().Be("Ely An Maureal");

        var patient = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == saved.PatientId);
        patient.FirstName.Should().Be("Ely An");
        patient.LastName.Should().Be("Maureal");
    }

    [Fact]
    public async Task Reimport_Heals_Previously_Truncated_Name_Dob_And_Sex_On_Existing_Patient()
    {
        var existingPatient = Phase3TestKit.NewPatient(_clinicId, Tenant);
        existingPatient.ClinicEzId = "CE-WDP9-FMBJ";
        existingPatient.FirstName = "Ely";
        existingPatient.LastName = "Maureal";
        existingPatient.MiddleName = null;
        existingPatient.Suffix = null;
        existingPatient.DateOfBirth = new DateOnly(2000, 1, 1);
        existingPatient.Sex = BiologicalSex.Unknown;
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        _db.Patients.Add(existingPatient);
        await _db.SaveChangesAsync();

        var import = SeedImport();

        var snapshot = Snapshot(SharingScopes.Demographics);
        snapshot = snapshot with
        {
            ClinicEzId = "ce-wdp9-fmbj",
            Demographics = new ShareDemographicsDto
            {
                FirstName = "Ely An",
                MiddleName = "Dela",
                LastName = "Maureal",
                Suffix = "Jr.",
                FullName = "Ely An Dela Maureal Jr.",
                DateOfBirth = "1994-08-20",
                Sex = "Male",
                MobileNumber = "0917-999-8888"
            }
        };

        await Deliver(import, snapshot);

        var saved = await Reload(import);
        saved.Status.Should().Be(ShareImportStatus.Imported);
        saved.PatientId.Should().Be(existingPatient.Id);
        saved.PatientName.Should().Be("Ely An Dela Maureal Jr.");

        var healed = await _db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == existingPatient.Id);
        healed.FirstName.Should().Be("Ely An");
        healed.MiddleName.Should().Be("Dela");
        healed.LastName.Should().Be("Maureal");
        healed.Suffix.Should().Be("Jr.");
        healed.DateOfBirth.Should().Be(new DateOnly(1994, 8, 20));
        healed.Sex.Should().Be(BiologicalSex.Male);
        healed.ContactNumber.Should().Be("0917-999-8888");
    }
}
