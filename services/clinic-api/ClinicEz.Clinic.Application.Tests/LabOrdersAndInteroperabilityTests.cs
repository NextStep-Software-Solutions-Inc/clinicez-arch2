using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
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
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class LabOrdersAndInteroperabilityTests
{
    private readonly Guid _testClinicId = Guid.NewGuid();
    private readonly string _testTenantId = "tenant-test-01";
    private readonly IClinicContext _clinicContext;

    public LabOrdersAndInteroperabilityTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public async Task CreateLabOrder_MintsHashedUploadGrantAndAbsoluteUrl()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);

        var handler = NewCreateHandler(db, sieve, unitOfWork, orderRepo, patientRepo);
        var command = new CreateClinicLabOrderCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Maria Santos",
            ClinicalDiagnosis: "Essential Hypertension",
            Notes: "10-12 hours fasting required",
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Complete Blood Count (CBC)", "Hematology", "Purple EDTA tube"),
                new("Fasting Blood Sugar (FBS)", "Clinical Chemistry", "Yellow SST tube")
            }
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.PublicUploadUrl.Should().StartWith(Phase3TestKit.UploadBaseUrl + "/");
        result.Status.Should().Be(LabOrderStatus.Ordered);
        result.Stage.Should().Be(LabOrderStage.Issued);

        var token = result.PublicUploadUrl![(Phase3TestKit.UploadBaseUrl.Length + 1)..];
        var grant = await db.UploadGrants.IgnoreQueryFilters().SingleAsync();
        grant.LabOrderId.Should().Be(result.Id);
        grant.TokenHash.Should().Equal(UploadGrantService.Hash(token));
        grant.TokenHash.Should().NotEqual(System.Text.Encoding.UTF8.GetBytes(token));
    }

    [Fact]
    public async Task AttachExternalLabResult_StoresEncryptedFileAsUnverifiedResult()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);

        var createHandler = NewCreateHandler(db, sieve, unitOfWork, orderRepo, patientRepo);
        var createdOrder = await createHandler.Handle(new CreateClinicLabOrderCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Juan Dela Cruz"
        ), CancellationToken.None);

        var files = new Phase3TestKit.InMemoryFileStore();
        var attachHandler = new AttachExternalLabResultCommandHandler(
            orderRepo, TestDbHelper.CreateRepository<ClinicLabResult>(db, sieve), _clinicContext, Phase3TestKit.Intake(db, files));
        var attachCommand = new AttachExternalLabResultCommand(
            OrderId: createdOrder.Id,
            ExternalLabName: "Hi-Precision Diagnostics Inc.",
            DocumentType: "Photo",
            FileBase64: "data:image/jpeg;base64," + Convert.ToBase64String(new byte[] { 1, 2, 3, 4 }),
            Notes: "CBC normal. Blood sugar within range.",
            ContentType: "image/jpeg",
            FileName: "cbc.jpg"
        );

        var updated = await attachHandler.Handle(attachCommand, CancellationToken.None);

        updated.Status.Should().Be(LabOrderStatus.CompletedWithExternalReport);
        updated.Stage.Should().Be(LabOrderStage.ExternalSubmitted);
        updated.Results.Should().ContainSingle().Which.VerificationState.Should().Be(VerificationState.Unverified);
        updated.ExternalLabName.Should().Be("Hi-Precision Diagnostics Inc.");
        var result = await db.LabResults.IgnoreQueryFilters().SingleAsync();
        result.Source.Should().Be(ResultSource.ExternalLab);
        result.Verification.Should().Be(VerificationState.Unverified);
        (await files.ReadAsync(result, CancellationToken.None)).Should().Equal(1, 2, 3, 4);
    }

    [Fact]
    public async Task GetClinicLabOrderSlip_ReturnsCompleteSlipDataWithQrPayload()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(db, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant-test",
            ClinicId = _clinicContext.ClinicId,
            PatientCode = "PAT-2026-0001",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "0917-123-4567",
            DateOfBirth = new DateOnly(1984, 3, 12),
            Gender = "Female",
            PhilHealthNumber = "12-050412345-6"
        }, CancellationToken.None);

        var createHandler = NewCreateHandler(db, sieve, unitOfWork, orderRepo, patientRepo);
        var createdOrder = await createHandler.Handle(new CreateClinicLabOrderCommand(
            PatientId: patientId,
            PatientName: "Maria Santos",
            ClinicalDiagnosis: "Hypertension Workup",
            Notes: "10-12 hours fasting"
        ), CancellationToken.None);

        var slipHandler = new GetClinicLabOrderSlipQueryHandler(
            orderRepo, patientRepo, settingsRepo, TestDbHelper.CreateRepository<StaffMember>(db, sieve), Phase3TestKit.Grants(db), unitOfWork);
        var slip = await slipHandler.Handle(new GetClinicLabOrderSlipQuery(createdOrder.Id), CancellationToken.None);

        slip.Should().NotBeNull();
        slip.OrderNumber.Should().Be(createdOrder.OrderNumber);
        slip.PatientName.Should().Be("Maria Santos");
        slip.PhilHealthNumber.Should().Be("12-050412345-6");
        slip.PublicUploadUrl.Should().StartWith(Phase3TestKit.UploadBaseUrl + "/");
        slip.QrPayload.Should().Be(createdOrder.ClaimToken ?? $"CLINICEZ:REQ:{createdOrder.OrderNumber}");
    }

    [Fact]
    public async Task CreateLabOrder_WithoutTarget_StaysPatientCarriedAndQueuesNothing()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var handler = NewCreateHandler(db, sieve, unitOfWork,
            TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve), TestDbHelper.CreateRepository<ClinicPatient>(db, sieve));

        var order = await handler.Handle(new CreateClinicLabOrderCommand(Guid.NewGuid(), "Maria Santos"), CancellationToken.None);

        order.PublicUploadUrl.Should().NotBeNullOrWhiteSpace();
        order.Stage.Should().Be(LabOrderStage.Issued);
        (await db.InteropOutbox.CountAsync(o => o.Type == InteropTypes.LabOrderIssued)).Should().Be(0);
    }

    [Fact]
    public async Task CreateLabOrder_Routed_QueuesRequisitionInTheSameSaveAsTheOrder()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var (doctorId, patientId) = SeedDoctorAndPatient(db);
        var probe = new MessagingTestKit.SaveProbe();
        var handler = NewCreateHandler(db, sieve, probe.Wrap(db, unitOfWork),
            TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve), TestDbHelper.CreateRepository<ClinicPatient>(db, sieve));
        var labFacilityId = Guid.NewGuid();

        var order = await handler.Handle(new CreateClinicLabOrderCommand(
            PatientId: patientId,
            PatientName: "Maria Santos",
            OrderedByDoctorId: doctorId,
            ClinicalDiagnosis: "Hypertension Workup",
            TargetFacilityId: labFacilityId.ToString(),
            TargetTenantId: "lab-tenant"), CancellationToken.None);

        // Exactly one commit, carrying the order and its outbox row together.
        probe.Saves.Should().ContainSingle();
        probe.Saves[0].PendingOutbox.Should().Be(1);
        probe.Saves[0].PendingBusiness.Should().BeGreaterThan(0);

        var row = await db.InteropOutbox.SingleAsync();
        row.Type.Should().Be(InteropTypes.LabOrderIssued);
        row.CorrelationId.Should().Be(order.Id);

        var envelope = InteropEnvelope.FromJson(row.EnvelopeJson);
        envelope.From.TenantId.Should().Be(_testTenantId);
        envelope.From.FacilityId.Should().Be(_testClinicId.ToString());
        envelope.To.TenantId.Should().Be("lab-tenant");
        envelope.To.FacilityId.Should().Be(labFacilityId.ToString());
        envelope.To.FacilityType.Should().Be(FacilityType.Laboratory);

        var requisition = envelope.GetPayload<LabRequisitionIssuedEvent>();
        requisition.RequisitionId.Should().Be(order.Id);
        requisition.OrderingFacilityName.Should().Be("Apex Clinic");
        requisition.OrderingDoctor.PrcLicenseNumber.Should().Be("0123456");
        requisition.Patient.PatientId.Should().Be(Guid.Empty, "a walk-in patient has no patient-app account for the lab to address");
        requisition.Patient.PhilHealthPin.Should().Be("12-050412345-6");
    }

    [Fact]
    public async Task CreateLabOrder_RoutedToMalformedFacility_PersistsNeitherOrderNorMessage()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var (doctorId, patientId) = SeedDoctorAndPatient(db);
        var handler = NewCreateHandler(db, sieve, unitOfWork,
            TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve), TestDbHelper.CreateRepository<ClinicPatient>(db, sieve));

        var act = () => handler.Handle(new CreateClinicLabOrderCommand(
            PatientId: patientId,
            PatientName: "Maria Santos",
            OrderedByDoctorId: doctorId,
            TargetFacilityId: "not-a-guid",
            TargetTenantId: "lab-tenant"), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
        (await db.LabOrders.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task CreateLabOrder_TargetFacilityWithoutTenant_IsRejected()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var handler = NewCreateHandler(db, sieve, unitOfWork,
            TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve), TestDbHelper.CreateRepository<ClinicPatient>(db, sieve));

        var act = () => handler.Handle(new CreateClinicLabOrderCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Maria Santos",
            TargetFacilityId: Guid.NewGuid().ToString()), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task CreateLabOrder_RoutedWithoutOrderingDoctor_IsRejected()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var (_, patientId) = SeedDoctorAndPatient(db);
        var handler = NewCreateHandler(db, sieve, unitOfWork,
            TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve), TestDbHelper.CreateRepository<ClinicPatient>(db, sieve));

        var act = () => handler.Handle(new CreateClinicLabOrderCommand(
            PatientId: patientId,
            PatientName: "Maria Santos",
            TargetFacilityId: Guid.NewGuid().ToString(),
            TargetTenantId: "lab-tenant"), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
        (await db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    private CreateClinicLabOrderCommandHandler NewCreateHandler(
        ApplicationDbContext db,
        ISieveProcessor sieve,
        IUnitOfWork unitOfWork,
        IRepository<ClinicLabOrder> orderRepo,
        IRepository<ClinicPatient> patientRepo,
        IHubClaimsClient? hub = null)
    {
        return new CreateClinicLabOrderCommandHandler(
            orderRepo,
            patientRepo,
            TestDbHelper.CreateRepository<StaffMember>(db, sieve),
            unitOfWork,
            _clinicContext,
            Phase3TestKit.Identity(_testClinicId, _testTenantId),
            new LabRequisitionPublisher(new InteropPublisher(db)),
            Phase3TestKit.Grants(db),
            Phase3TestKit.Claims(hub),
            Phase3TestKit.Documents(db));
    }

    private (Guid DoctorId, Guid PatientId) SeedDoctorAndPatient(ApplicationDbContext db)
    {
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            FirstName = "Ana",
            LastName = "Cruz",
            Title = "Dr.",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0123456",
            Specialty = "Internal Medicine"
        };
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-2026-0001",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "0917-123-4567",
            DateOfBirth = new DateOnly(1984, 3, 12),
            Gender = "Female",
            PhilHealthNumber = "12-050412345-6"
        };
        db.StaffMembers.Add(doctor);
        db.Patients.Add(patient);
        db.SaveChanges();
        return (doctor.Id, patient.Id);
    }
}
