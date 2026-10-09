using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.LabResults.Commands;
using ClinicEz.Clinic.Application.Features.LabResults.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class LabResultReviewTests
{
    private const string Tenant = "tenant-review";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext = Substitute.For<IClinicContext>();

    public LabResultReviewTests()
    {
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(Tenant);
    }

    private (ApplicationDbContext Db, IUnitOfWork Uow, Sieve.Services.ISieveProcessor Sieve, StaffMember Doctor, ClinicLabOrder Order, ClinicLabResult Result)
        Seed(ResultSource source = ResultSource.ExternalLab, VerificationState state = VerificationState.Unverified, bool signedInAsDoctor = true)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        MessagingTestKit.SeedClinic(db, _clinicId, Tenant);
        var patient = Phase3TestKit.NewPatient(_clinicId, Tenant, Guid.NewGuid());
        var doctor = Phase3TestKit.NewDoctor(_clinicId, Tenant);
        var order = Phase3TestKit.NewLabOrder(_clinicId, Tenant, patient.Id);
        order.OrderedByDoctorId = doctor.Id;
        order.OrderedByDoctorName = "Dr. Ana Cruz";
        var result = new ClinicLabResult
        {
            Id = Guid.NewGuid(),
            TenantId = Tenant,
            ClinicId = _clinicId,
            LabOrderId = order.Id,
            Source = source,
            Verification = state,
            FileName = "r.pdf",
            ContentType = "application/pdf",
            SubmittedAt = DateTime.UtcNow
        };
        db.Patients.Add(patient);
        db.StaffMembers.Add(doctor);
        db.LabOrders.Add(order);
        db.LabResults.Add(result);
        db.SaveChanges();
        _clinicContext.StaffId.Returns(signedInAsDoctor ? doctor.Id : (Guid?)null);
        return (db, uow, sieve, doctor, order, result);
    }

    private ReviewLabResultCommandHandler Handler(ApplicationDbContext db, Sieve.Services.ISieveProcessor sieve, IUnitOfWork uow) =>
        new(TestDbHelper.CreateRepository<ClinicLabResult>(db, sieve),
            TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve),
            TestDbHelper.CreateRepository<StaffMember>(db, sieve),
            uow,
            _clinicContext,
            Phase3TestKit.Reviewed(db),
            Phase3TestKit.Documents(db));

    [Fact]
    public async Task Accepting_Verifies_The_Result_Records_The_Reviewer_And_Advances_The_Order()
    {
        var (db, uow, sieve, doctor, order, result) = Seed();
        var probe = new MessagingTestKit.SaveProbe();

        var dto = await Handler(db, sieve, probe.Wrap(db, uow)).Handle(new ReviewLabResultCommand(result.Id, true, " looks fine "), CancellationToken.None);

        dto.VerificationState.Should().Be(VerificationState.Verified);
        var saved = await db.LabResults.IgnoreQueryFilters().SingleAsync();
        saved.Verification.Should().Be(VerificationState.Verified);
        saved.VerifiedByStaffId.Should().Be(doctor.Id);
        saved.VerifiedByPrc.Should().Be("0123456");
        saved.ReviewRemarks.Should().Be("looks fine");
        saved.VerifiedAt.Should().NotBeNull();
        (await db.LabOrders.IgnoreQueryFilters().SingleAsync()).Stage.Should().Be(LabOrderStage.Reviewed);
        order.Should().NotBeNull();

        probe.Saves.Should().ContainSingle();
        probe.Saves[0].PendingOutbox.Should().BeGreaterThan(0, "the document and review rows commit with the decision");
    }

    [Fact]
    public async Task Rejecting_Requires_Remarks_And_Records_Them_As_The_Stage_Reason()
    {
        var (db, uow, sieve, _, _, result) = Seed();
        var handler = Handler(db, sieve, uow);

        var withoutRemarks = () => handler.Handle(new ReviewLabResultCommand(result.Id, false, "  "), CancellationToken.None);
        await withoutRemarks.Should().ThrowAsync<BadRequestException>();
        (await db.LabResults.IgnoreQueryFilters().SingleAsync()).Verification.Should().Be(VerificationState.Unverified);

        await handler.Handle(new ReviewLabResultCommand(result.Id, false, "Wrong patient"), CancellationToken.None);

        (await db.LabResults.IgnoreQueryFilters().SingleAsync()).Verification.Should().Be(VerificationState.Rejected);
        var order = await db.LabOrders.IgnoreQueryFilters().SingleAsync();
        order.Stage.Should().Be(LabOrderStage.Rejected);
        order.StageReason.Should().Be("Wrong patient");
    }

    [Fact]
    public async Task The_Decision_Is_Announced_To_The_Patient_And_The_Document_Copy_Is_Updated()
    {
        var (db, uow, sieve, _, _, result) = Seed();

        await Handler(db, sieve, uow).Handle(new ReviewLabResultCommand(result.Id, true, null), CancellationToken.None);

        var types = await db.InteropOutbox.Select(o => o.Type).ToListAsync();
        types.Should().Contain(InteropTypes.PatientDocumentIssued);
    }

    [Fact]
    public async Task A_Result_Can_Only_Be_Reviewed_Once()
    {
        var (db, uow, sieve, _, _, result) = Seed();
        var handler = Handler(db, sieve, uow);
        await handler.Handle(new ReviewLabResultCommand(result.Id, true, null), CancellationToken.None);

        var again = () => handler.Handle(new ReviewLabResultCommand(result.Id, false, "changed my mind"), CancellationToken.None);

        await again.Should().ThrowAsync<ConflictException>();
        (await db.LabResults.IgnoreQueryFilters().SingleAsync()).Verification.Should().Be(VerificationState.Verified);
    }

    [Fact]
    public async Task A_ClinicEz_Lab_Result_Is_Not_Reviewable()
    {
        var (db, uow, sieve, _, _, result) = Seed(ResultSource.ClinicEzLab, VerificationState.Verified);

        var act = () => Handler(db, sieve, uow).Handle(new ReviewLabResultCommand(result.Id, false, "nope"), CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task An_Unknown_Result_Is_Not_Found_And_A_Foreign_Clinics_Result_Is_Invisible()
    {
        var (db, uow, sieve, _, _, _) = Seed();
        var foreign = new ClinicLabResult
        {
            Id = Guid.NewGuid(), TenantId = Tenant, ClinicId = Guid.NewGuid(), LabOrderId = Guid.NewGuid(),
            Source = ResultSource.ExternalLab, Verification = VerificationState.Unverified
        };
        db.LabResults.Add(foreign);
        db.SaveChanges();
        var handler = Handler(db, sieve, uow);

        var unknown = () => handler.Handle(new ReviewLabResultCommand(Guid.NewGuid(), true, null), CancellationToken.None);
        var crossClinic = () => handler.Handle(new ReviewLabResultCommand(foreign.Id, true, null), CancellationToken.None);

        await unknown.Should().ThrowAsync<NotFoundException>();
        await crossClinic.Should().ThrowAsync<NotFoundException>();
        (await db.LabResults.IgnoreQueryFilters().SingleAsync(r => r.Id == foreign.Id)).Verification.Should().Be(VerificationState.Unverified);
    }

    [Fact]
    public async Task Only_A_Signed_In_Staff_Member_Of_The_Clinic_Can_Review()
    {
        var (db, uow, sieve, _, _, result) = Seed(signedInAsDoctor: false);

        var anonymous = () => Handler(db, sieve, uow).Handle(new ReviewLabResultCommand(result.Id, true, null), CancellationToken.None);
        await anonymous.Should().ThrowAsync<BadRequestException>();

        _clinicContext.StaffId.Returns(Guid.NewGuid());
        var stranger = () => Handler(db, sieve, uow).Handle(new ReviewLabResultCommand(result.Id, true, null), CancellationToken.None);
        await stranger.Should().ThrowAsync<BadRequestException>();

        (await db.LabResults.IgnoreQueryFilters().SingleAsync()).Verification.Should().Be(VerificationState.Unverified);
    }

    [Fact]
    public async Task The_Inbox_Filters_By_State_And_Scope_And_Never_Lists_Another_Clinics_Results()
    {
        var (db, uow, sieve, doctor, order, mine) = Seed();
        var otherDoctorOrder = Phase3TestKit.NewLabOrder(_clinicId, Tenant, order.PatientId, "LAB-OTHER");
        otherDoctorOrder.OrderedByDoctorId = Guid.NewGuid();
        var othersResult = new ClinicLabResult
        {
            Id = Guid.NewGuid(), TenantId = Tenant, ClinicId = _clinicId, LabOrderId = otherDoctorOrder.Id,
            Source = ResultSource.PatientUploaded, Verification = VerificationState.Unverified
        };
        var verified = new ClinicLabResult
        {
            Id = Guid.NewGuid(), TenantId = Tenant, ClinicId = _clinicId, LabOrderId = order.Id,
            Source = ResultSource.ClinicEzLab, Verification = VerificationState.Verified
        };
        var foreignOrder = Phase3TestKit.NewLabOrder(Guid.NewGuid(), Tenant, Guid.NewGuid(), order.OrderNumber);
        var foreign = new ClinicLabResult
        {
            Id = Guid.NewGuid(), TenantId = Tenant, ClinicId = foreignOrder.ClinicId, LabOrderId = foreignOrder.Id,
            Source = ResultSource.ExternalLab, Verification = VerificationState.Unverified
        };
        db.LabOrders.AddRange(otherDoctorOrder, foreignOrder);
        db.LabResults.AddRange(othersResult, verified, foreign);
        db.SaveChanges();
        var handler = new GetLabResultReviewQueueQueryHandler(
            TestDbHelper.CreateRepository<ClinicLabResult>(db, sieve), TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve), _clinicContext);

        var myUnverified = await handler.Handle(new GetLabResultReviewQueueQuery(), CancellationToken.None);
        var allUnverified = await handler.Handle(new GetLabResultReviewQueueQuery(MineOnly: false), CancellationToken.None);
        var verifiedList = await handler.Handle(new GetLabResultReviewQueueQuery(VerificationState.Verified), CancellationToken.None);

        myUnverified.Select(r => r.Id).Should().Equal(mine.Id);
        myUnverified[0].TestNames.Should().Contain("CBC");
        allUnverified.Select(r => r.Id).Should().BeEquivalentTo(new[] { mine.Id, othersResult.Id });
        allUnverified.Select(r => r.Id).Should().NotContain(foreign.Id);
        verifiedList.Select(r => r.Id).Should().Equal(verified.Id);
        doctor.Should().NotBeNull();
    }
}

public class InvoiceBillingRequestTests
{
    private const string Tenant = "tenant-bill";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext = Substitute.For<IClinicContext>();

    public InvoiceBillingRequestTests()
    {
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(Tenant);
    }

    private (CreateInvoiceCommandHandler Handler, ApplicationDbContext Db, ClinicPatient Patient) Build(bool provisioned = true)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = Phase3TestKit.NewPatient(_clinicId, Tenant, Guid.NewGuid());
        db.Patients.Add(patient);
        db.SaveChanges();
        var identity = provisioned ? Phase3TestKit.Identity(_clinicId, Tenant) : Substitute.For<IClinicIdentityProvider>();
        var handler = new CreateInvoiceCommandHandler(
            TestDbHelper.CreateRepository<Invoice>(db, sieve),
            TestDbHelper.CreateRepository<ClinicPatient>(db, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            uow,
            _clinicContext,
            new BillingRequestPublisher(identity, new InteropPublisher(db)));
        return (handler, db, patient);
    }

    private static List<CreateInvoiceLineItemRequest> Lines() => new()
    {
        new(null, "CONS", "Consultation", "Consultation", 500m, 1),
        new(null, "CBC", "CBC", "Laboratory", 250m, 2)
    };

    [Fact]
    public async Task An_Invoice_Queues_A_Billing_Request_In_The_Same_Save_With_The_Clinic_Lines()
    {
        var (handler, db, patient) = Build();
        var consultationId = Guid.NewGuid();

        var invoice = await handler.Handle(new CreateInvoiceCommand(patient.Id, "Maria Santos", ConsultationId: consultationId, LineItems: Lines()), CancellationToken.None);

        var row = await db.InteropOutbox.SingleAsync(o => o.Type == InteropTypes.BillingInvoiceRequested);
        row.CorrelationId.Should().Be(invoice.Id);
        var envelope = InteropEnvelope.FromJson(row.EnvelopeJson);
        envelope.From.FacilityId.Should().Be(_clinicId.ToString());
        envelope.To.Service.Should().Be(InteropServices.Billing);
        envelope.To.FacilityId.Should().Be(_clinicId.ToString());
        var payload = envelope.GetPayload<BillingInvoiceRequestedPayload>();
        payload.InvoiceRequestId.Should().Be(invoice.Id);
        payload.VisitKey.Should().Be(consultationId.ToString());
        payload.PatientId.Should().Be(patient.SyncPatientId);
        payload.TenantId.Should().Be(Tenant);
        payload.FacilityType.Should().Be(FacilityType.Clinic);
        payload.Lines.Sum(l => l.Quantity * l.UnitPrice).Should().Be(1000m);
    }

    [Fact]
    public async Task A_Discount_Becomes_A_Negative_Line_So_The_Counter_Charges_The_Net_Amount()
    {
        var (handler, db, patient) = Build();

        await handler.Handle(new CreateInvoiceCommand(patient.Id, "Maria Santos", DiscountType: DiscountType.SeniorCitizen, DiscountIdNumber: "OSCA-1", LineItems: Lines()), CancellationToken.None);

        var payload = InteropEnvelope.FromJson((await db.InteropOutbox.SingleAsync()).EnvelopeJson).GetPayload<BillingInvoiceRequestedPayload>();
        payload.Lines.Should().Contain(l => l.Code == "DISCOUNT" && l.UnitPrice == -200m);
        payload.Lines.Sum(l => l.Quantity * l.UnitPrice).Should().Be(800m);
    }

    [Fact]
    public async Task A_Fully_Covered_Invoice_Sends_No_Billing_Request()
    {
        var (handler, db, patient) = Build();

        await handler.Handle(new CreateInvoiceCommand(patient.Id, "Maria Santos", DiscountType: DiscountType.PhilHealthKonsulta, LineItems: Lines()), CancellationToken.None);

        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task An_Unprovisioned_Clinic_Still_Bills_Locally_Without_A_Request()
    {
        var (handler, db, patient) = Build(provisioned: false);

        var invoice = await handler.Handle(new CreateInvoiceCommand(patient.Id, "Maria Santos", LineItems: Lines()), CancellationToken.None);

        invoice.NetAmount.Should().Be(1000m);
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task The_Visit_Key_Falls_Back_To_The_Queue_Item()
    {
        var (handler, db, patient) = Build();
        var queueItemId = Guid.NewGuid();

        await handler.Handle(new CreateInvoiceCommand(patient.Id, "Maria Santos", QueueItemId: queueItemId, LineItems: Lines()), CancellationToken.None);

        var payload = InteropEnvelope.FromJson((await db.InteropOutbox.SingleAsync()).EnvelopeJson).GetPayload<BillingInvoiceRequestedPayload>();
        payload.VisitKey.Should().Be(queueItemId.ToString());
    }
}

public class ShareRedeemFlowTests
{
    private const string Tenant = "tenant-share";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext = Substitute.For<IClinicContext>();
    private readonly Guid _staffId = Guid.NewGuid();

    public ShareRedeemFlowTests()
    {
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(Tenant);
        _clinicContext.StaffId.Returns(_staffId);
    }

    private RedeemPatientShareCommandHandler Handler(ApplicationDbContext db, IUnitOfWork uow, bool provisioned = true) =>
        new(new PatientRecordGateway(db, _clinicContext,
                provisioned ? Phase3TestKit.Identity(_clinicId, Tenant) : Substitute.For<IClinicIdentityProvider>(),
                new InteropPublisher(db)),
            uow);

    [Fact]
    public async Task Redeeming_Records_A_Pending_Import_And_Queues_The_Request_From_The_Clinic_Party()
    {
        var (db, uow, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var probe = new MessagingTestKit.SaveProbe();

        var accepted = await Handler(db, probe.Wrap(db, uow)).Handle(
            new RedeemPatientShareCommand("SHARE-TOKEN-12345", "Consultation", true, "Cough"), CancellationToken.None);

        probe.Saves.Should().ContainSingle();
        probe.Saves[0].PendingOutbox.Should().Be(1);
        var import = await db.ShareImports.IgnoreQueryFilters().SingleAsync();
        import.Id.Should().Be(accepted.CorrelationId);
        import.Status.Should().Be(ShareImportStatus.Pending);
        import.RequestedByStaffId.Should().Be(_staffId);
        import.AddToQueue.Should().BeTrue();
        import.ChiefComplaint.Should().Be("Cough");
        import.ClinicId.Should().Be(_clinicId);

        var row = await db.InteropOutbox.SingleAsync();
        row.Type.Should().Be(InteropTypes.PatientShareRedeem);
        row.CorrelationId.Should().Be(accepted.CorrelationId);
        var envelope = InteropEnvelope.FromJson(row.EnvelopeJson);
        envelope.From.Should().Be(Party.ForFacility(Tenant, _clinicId.ToString(), FacilityType.Clinic));
        envelope.To.Kind.Should().Be(PartyKind.ControlPlane);
        envelope.To.Service.Should().Be(InteropServices.Patient);
        envelope.GetPayload<PatientShareRedeemPayload>().ShareToken.Should().Be("SHARE-TOKEN-12345");
    }

    [Fact]
    public async Task An_Unprovisioned_Clinic_Cannot_Redeem_And_Nothing_Is_Saved()
    {
        var (db, uow, _) = TestDbHelper.CreateTestContext(_clinicContext);

        var act = () => Handler(db, uow, provisioned: false).Handle(
            new RedeemPatientShareCommand("SHARE-TOKEN-12345", "Consultation", false, null), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
        (await db.ShareImports.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void The_Validator_Rejects_A_Missing_Token(string token)
    {
        var result = new RedeemPatientShareCommandValidator().Validate(
            new RedeemPatientShareCommand(token, "Consultation", false, null));

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void The_Validator_Rejects_An_Oversized_Token_And_Accepts_A_Normal_One()
    {
        var validator = new RedeemPatientShareCommandValidator();

        validator.Validate(new RedeemPatientShareCommand(new string('x', 2049))).IsValid.Should().BeFalse();
        validator.Validate(new RedeemPatientShareCommand("SHARE-TOKEN-12345")).IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Redeeming_By_Manual_Code_Sends_An_Empty_Token_With_The_ClinicEz_Id_And_Code()
    {
        var (db, uow, _) = TestDbHelper.CreateTestContext(_clinicContext);

        var accepted = await Handler(db, uow).Handle(
            new RedeemPatientShareCommand(null, "Consultation", false, null, " CEZ-0001 ", " ab12-cd34 "), CancellationToken.None);

        var row = await db.InteropOutbox.SingleAsync();
        row.CorrelationId.Should().Be(accepted.CorrelationId);
        var payload = InteropEnvelope.FromJson(row.EnvelopeJson).GetPayload<PatientShareRedeemPayload>();
        payload.ShareToken.Should().BeEmpty();
        payload.ClinicEzId.Should().Be("CEZ-0001");
        payload.Code.Should().Be("ab12-cd34");
    }

    [Theory]
    [InlineData("CEZ-0001", "ABCD-1234", true)]
    [InlineData("CEZ-0001", "abcd 1234", true)]
    [InlineData("CEZ-0001", "ABCD1234", true)]
    [InlineData("CEZ-0001", "ABC", false)]
    [InlineData("CEZ-0001", "ABCD-12!4", false)]
    [InlineData("", "ABCD-1234", false)]
    [InlineData("CEZ-0001", "", false)]
    public void The_Validator_Checks_A_Manual_Code_Redeem(string clinicEzId, string code, bool valid)
    {
        var result = new RedeemPatientShareCommandValidator().Validate(
            new RedeemPatientShareCommand(null, "Consultation", false, null, clinicEzId, code));

        result.IsValid.Should().Be(valid);
    }

    [Fact]
    public void The_Validator_Rejects_A_Token_Combined_With_A_Manual_Code()
    {
        var result = new RedeemPatientShareCommandValidator().Validate(
            new RedeemPatientShareCommand("SHARE-TOKEN-12345", "Consultation", false, null, "CEZ-0001", "ABCD-1234"));

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task The_Status_Query_Returns_Only_This_Clinics_Import()
    {
        var (db, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var mine = new ShareImport { Id = Guid.NewGuid(), TenantId = Tenant, ClinicId = _clinicId, Status = ShareImportStatus.Imported, Scopes = SharingScopes.Demographics | SharingScopes.Allergies, PatientName = "Maria Santos" };
        var foreign = new ShareImport { Id = Guid.NewGuid(), TenantId = Tenant, ClinicId = Guid.NewGuid() };
        db.ShareImports.AddRange(mine, foreign);
        db.SaveChanges();
        var handler = new GetShareImportStatusQueryHandler(TestDbHelper.CreateRepository<ShareImport>(db, sieve));

        var dto = await handler.Handle(new GetShareImportStatusQuery(mine.Id), CancellationToken.None);
        var crossClinic = () => handler.Handle(new GetShareImportStatusQuery(foreign.Id), CancellationToken.None);

        dto.Status.Should().Be("Imported");
        dto.Scopes.Should().BeEquivalentTo("Demographics", "Allergies");
        await crossClinic.Should().ThrowAsync<NotFoundException>();
    }
}

public class ExternalPrescriptionDispensedHandlerTests
{
    private const string Tenant = "tenant-rx";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly ApplicationDbContext _db = MessagingTestKit.CreateDbContext();

    private ExternalPrescriptionDispensedHandler Handler() =>
        new(_db, MessagingTestKit.Recipient(_db), NullLogger<ExternalPrescriptionDispensedHandler>.Instance);

    private (ConsultationEncounter Encounter, ClinicPatient Patient) Seed()
    {
        MessagingTestKit.SeedClinic(_db, _clinicId, Tenant);
        var patient = Phase3TestKit.NewPatient(_clinicId, Tenant, Guid.NewGuid());
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = Tenant,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Maria Santos",
            DoctorName = "Dr. Ana Cruz"
        };
        _db.Patients.Add(patient);
        _db.Consultations.Add(encounter);
        _db.SaveChanges();
        return (encounter, patient);
    }

    private Task Deliver(Guid prescriptionId, Party from, Guid? correlation = null)
    {
        var payload = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = prescriptionId,
            ExternalPharmacyName = "Mercury Drug",
            ExternalBranchLocation = "Makati",
            PharmacistName = "Pablo Reyes",
            PharmacistPrcLicense = "9988",
            OfficialReceiptNumber = "OR-1",
            ReceiptDocumentUrl = "https://signed.example.test/receipt?sig=secret",
            Notes = "complete"
        };
        return Handler().HandleAsync(payload,
            MessagingTestKit.Delivered(InteropTypes.RxExternalDispensed, from, MessagingTestKit.ClinicParty(Tenant, _clinicId),
                correlation ?? prescriptionId, payload),
            CancellationToken.None);
    }

    private Task<ConsultationEncounter> Reload(ConsultationEncounter e) =>
        _db.Consultations.IgnoreQueryFilters().SingleAsync(c => c.Id == e.Id);

    [Fact]
    public async Task The_Owning_Patient_Reports_An_External_Fill()
    {
        var (encounter, patient) = Seed();

        await Deliver(encounter.Id, Party.ForPatient(patient.SyncPatientId!.Value.ToString()));

        var saved = await Reload(encounter);
        saved.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.DispensedExternally);
        saved.RxDispensedPharmacyName.Should().Be("Mercury Drug (Makati)");
        saved.RxDispensedReceiptNumber.Should().Be("OR-1");
        saved.RxDispensedPharmacistPrc.Should().Be("9988");
        saved.RxNotes.Should().Contain("reported by the patient");
        saved.RxDispensedReceiptUrl.Should().BeNull("the receipt link is time-limited and is not stored");
    }

    [Fact]
    public async Task Another_Patient_A_Facility_And_A_Mismatched_Correlation_Are_Ignored()
    {
        var (encounter, patient) = Seed();

        await Deliver(encounter.Id, Party.ForPatient(Guid.NewGuid().ToString()));
        await Deliver(encounter.Id, MessagingTestKit.PharmacyParty());
        await Deliver(encounter.Id, Party.ForPatient(patient.SyncPatientId!.Value.ToString()), correlation: Guid.NewGuid());

        (await Reload(encounter)).RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.Issued);
    }

    [Fact]
    public async Task An_Already_Dispensed_Prescription_Is_Not_Overwritten()
    {
        var (encounter, patient) = Seed();
        encounter.RxDispenseStatus = PrescriptionDispenseStatus.DispensedAtPartnerPharmacy;
        encounter.RxDispensedPharmacyName = "Partner Pharmacy";
        await _db.SaveChangesAsync();

        await Deliver(encounter.Id, Party.ForPatient(patient.SyncPatientId!.Value.ToString()));

        var saved = await Reload(encounter);
        saved.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.DispensedAtPartnerPharmacy);
        saved.RxDispensedPharmacyName.Should().Be("Partner Pharmacy");
    }

    [Fact]
    public async Task A_Prescription_Of_Another_Clinic_Is_Not_Touched()
    {
        var (encounter, patient) = Seed();
        var other = Guid.NewGuid();
        var foreign = new ConsultationEncounter
        {
            Id = Guid.NewGuid(), TenantId = Tenant, ClinicId = other, PatientId = patient.Id, PatientName = "X", DoctorName = "Y"
        };
        _db.Consultations.Add(foreign);
        await _db.SaveChangesAsync();

        await Deliver(foreign.Id, Party.ForPatient(patient.SyncPatientId!.Value.ToString()));

        (await Reload(foreign)).RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.Issued);
        encounter.Should().NotBeNull();
    }
}
