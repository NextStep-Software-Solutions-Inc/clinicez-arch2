using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>Hub claims for patient-carried slips and the patient's synced copy of every issued document.</summary>
public class LabClaimsAndDocumentsTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string Tenant = "tenant-claims";
    private readonly IClinicContext _clinicContext = Substitute.For<IClinicContext>();

    public LabClaimsAndDocumentsTests()
    {
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(Tenant);
    }

    private CreateClinicLabOrderCommandHandler NewHandler(
        ApplicationDbContext db, Sieve.Services.ISieveProcessor sieve, IUnitOfWork uow, IHubClaimsClient? hub, bool provisioned = true) =>
        new(TestDbHelper.CreateRepository<LabOrder>(db, sieve),
            TestDbHelper.CreateRepository<Patient>(db, sieve),
            TestDbHelper.CreateRepository<StaffMember>(db, sieve),
            uow,
            _clinicContext,
            provisioned ? Phase3TestKit.Identity(_clinicId, Tenant) : Substitute.For<IClinicIdentityProvider>(),
            new LabRequisitionPublisher(new InteropPublisher(db)),
            Phase3TestKit.Grants(db),
            Phase3TestKit.Claims(hub),
            Phase3TestKit.Documents(db));

    private (Patient Patient, StaffMember Doctor) Seed(ApplicationDbContext db, bool patientLinked = true, string? prc = "0123456")
    {
        MessagingTestKit.SeedClinic(db, _clinicId, Tenant);
        var patient = Phase3TestKit.NewPatient(_clinicId, Tenant, patientLinked ? Guid.NewGuid() : null);
        var doctor = Phase3TestKit.NewDoctor(_clinicId, Tenant);
        doctor.PrcLicenseNumber = prc;
        db.Patients.Add(patient);
        db.StaffMembers.Add(doctor);
        db.SaveChanges();
        return (patient, doctor);
    }

    private static CreateClinicLabOrderCommand Command(Patient patient, StaffMember doctor, string? targetFacility = null, string? targetTenant = null) =>
        new(patient.Id, "Maria Santos", OrderedByDoctorId: doctor.Id, TargetFacilityId: targetFacility, TargetTenantId: targetTenant);

    [Fact]
    public async Task A_Patient_Carried_Slip_Gets_A_Hub_Claim_Stored_On_The_Order()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var (patient, doctor) = Seed(db);
        var requests = new List<ClaimSlipRequest>();

        var order = await NewHandler(db, sieve, uow, Phase3TestKit.Hub(requests)).Handle(Command(patient, doctor), CancellationToken.None);

        order.ClaimToken.Should().Be(Phase3TestKit.ClaimToken);
        var saved = await db.LabOrders.IgnoreQueryFilters().SingleAsync();
        saved.ClaimToken.Should().Be(Phase3TestKit.ClaimToken);
        saved.ClaimExpiresAt.Should().NotBeNull();

        var envelope = requests.Should().ContainSingle().Subject.Envelope;
        envelope.Type.Should().Be(InteropTypes.LabOrderIssued);
        envelope.From.FacilityId.Should().Be(_clinicId.ToString());
        envelope.From.TenantId.Should().Be(Tenant);
        envelope.To.FacilityType.Should().Be(FacilityType.Laboratory);
        envelope.To.FacilityId.Should().BeNull("any laboratory may redeem the claim");
        envelope.CorrelationId.Should().Be(order.Id);
        (await db.InteropOutbox.CountAsync(o => o.Type == InteropTypes.LabOrderIssued)).Should().Be(0, "the claim, not a message, carries the requisition");
    }

    [Fact]
    public async Task A_Routed_Order_Sends_The_Requisition_And_Mints_No_Claim()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var (patient, doctor) = Seed(db);
        var requests = new List<ClaimSlipRequest>();

        var order = await NewHandler(db, sieve, uow, Phase3TestKit.Hub(requests))
            .Handle(Command(patient, doctor, Guid.NewGuid().ToString(), "lab-tenant"), CancellationToken.None);

        requests.Should().BeEmpty();
        order.ClaimToken.Should().BeNull();
        order.Stage.Should().Be(LabOrderStage.Routed);
        (await db.InteropOutbox.CountAsync(o => o.Type == InteropTypes.LabOrderIssued)).Should().Be(1);
    }

    [Theory]
    [InlineData(false, "0123456", true)]
    [InlineData(true, null, true)]
    [InlineData(true, "", true)]
    [InlineData(true, "0123456", false)]
    public async Task A_Slip_Without_The_Prerequisites_Stays_A_Local_Paper_Slip(bool patientExists, string? prc, bool provisioned)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var (patient, doctor) = Seed(db, prc: prc);
        var requests = new List<ClaimSlipRequest>();
        var command = patientExists ? Command(patient, doctor) : Command(patient, doctor) with { PatientId = Guid.NewGuid() };

        var order = await NewHandler(db, sieve, uow, Phase3TestKit.Hub(requests), provisioned).Handle(command, CancellationToken.None);

        requests.Should().BeEmpty();
        order.ClaimToken.Should().BeNull();
        order.PublicUploadUrl.Should().NotBeNullOrWhiteSpace("the paper slip still carries the external-lab upload link");
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task A_Routed_Order_Without_A_Provisioned_Clinic_Is_Rejected()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var (patient, doctor) = Seed(db);

        var act = () => NewHandler(db, sieve, uow, Phase3TestKit.Hub(), provisioned: false)
            .Handle(Command(patient, doctor, Guid.NewGuid().ToString(), "lab-tenant"), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
        (await db.LabOrders.IgnoreQueryFilters().CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task The_Hub_Failing_Aborts_The_Order_Instead_Of_Silently_Dropping_The_Claim()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var (patient, doctor) = Seed(db);
        var hub = Substitute.For<IHubClaimsClient>();
        hub.CreateAsync(Arg.Any<ClaimSlipRequest>(), Arg.Any<CancellationToken>()).Returns<Task<ClaimSlipResult>>(_ => throw new InvalidOperationException("hub down"));

        var act = () => NewHandler(db, sieve, uow, hub).Handle(Command(patient, doctor), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("hub down");
        (await db.LabOrders.IgnoreQueryFilters().CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task The_Lab_Request_Document_Is_Synced_To_The_Linked_Patient_With_The_Claim_And_A_Stable_Id()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var (patient, doctor) = Seed(db);

        var order = await NewHandler(db, sieve, uow, Phase3TestKit.Hub()).Handle(Command(patient, doctor), CancellationToken.None);

        var row = await db.InteropOutbox.SingleAsync(o => o.Type == InteropTypes.PatientDocumentIssued);
        var envelope = InteropEnvelope.FromJson(row.EnvelopeJson);
        envelope.To.Kind.Should().Be(PartyKind.Patient);
        envelope.To.PatientId.Should().Be(patient.CloudPatientId!.Value.ToString());
        var document = envelope.GetPayload<PatientDocumentIssuedPayload>();
        document.DocumentId.Should().Be(order.Id);
        document.Kind.Should().Be(PatientDocumentKind.LabRequest);
        document.ClaimToken.Should().Be(Phase3TestKit.ClaimToken);
        document.IssuerFacilityId.Should().Be(_clinicId.ToString());
        row.CorrelationId.Should().Be(order.Id);
    }

    [Fact]
    public async Task A_Patient_Without_An_App_Account_Gets_No_Document_Message()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var (patient, doctor) = Seed(db, patientLinked: false);

        await NewHandler(db, sieve, uow, Phase3TestKit.Hub()).Handle(Command(patient, doctor), CancellationToken.None);

        (await db.InteropOutbox.CountAsync(o => o.Type == InteropTypes.PatientDocumentIssued)).Should().Be(0);
    }

    [Fact]
    public async Task The_Claim_And_The_Order_Commit_In_One_Save()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var (patient, doctor) = Seed(db);
        var probe = new MessagingTestKit.SaveProbe();

        await NewHandler(db, sieve, probe.Wrap(db, uow), Phase3TestKit.Hub()).Handle(Command(patient, doctor), CancellationToken.None);

        probe.Saves.Should().ContainSingle();
        probe.Saves[0].PendingOutbox.Should().Be(1, "the patient document row is queued next to the order");
    }
}
