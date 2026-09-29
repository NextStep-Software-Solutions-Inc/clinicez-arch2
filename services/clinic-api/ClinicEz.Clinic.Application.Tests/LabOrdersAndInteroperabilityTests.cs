using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
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
    public async Task CreateLabOrder_GeneratesPublicUploadTokenAndUrl()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);

        var handler = new CreateClinicLabOrderCommandHandler(orderRepo, patientRepo, unitOfWork, _clinicContext);
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
        result.PublicUploadToken.Should().NotBeNullOrWhiteSpace();
        result.PublicUploadUrl.Should().Contain(result.PublicUploadToken);
        result.Status.Should().Be(LabOrderStatus.Ordered);
    }

    [Fact]
    public async Task AttachExternalLabResult_UpdatesStatusAndStoresDocument()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);

        var createHandler = new CreateClinicLabOrderCommandHandler(orderRepo, patientRepo, unitOfWork, _clinicContext);
        var createdOrder = await createHandler.Handle(new CreateClinicLabOrderCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Juan Dela Cruz"
        ), CancellationToken.None);

        var attachHandler = new AttachExternalLabResultCommandHandler(orderRepo, unitOfWork);
        var attachCommand = new AttachExternalLabResultCommand(
            OrderId: createdOrder.Id,
            ExternalLabName: "Hi-Precision Diagnostics Inc.",
            DocumentType: "Photo",
            DocumentUrl: "https://storage.clinicez.com/results/sample-photo.jpg",
            FileBase64: "data:image/jpeg;base64,sample-bytes",
            Notes: "CBC normal. Blood sugar within range.",
            UploadedBy: "Patient"
        );

        var updated = await attachHandler.Handle(attachCommand, CancellationToken.None);

        updated.Status.Should().Be(LabOrderStatus.CompletedWithExternalReport);
        updated.ExternalLabName.Should().Be("Hi-Precision Diagnostics Inc.");
        updated.ExternalReportType.Should().Be("Photo");
        updated.UploadedBy.Should().Be("Patient");
        updated.ReportReleasedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task SubmitPublicLabUpload_AcceptsResultViaToken()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);

        var createHandler = new CreateClinicLabOrderCommandHandler(orderRepo, patientRepo, unitOfWork, _clinicContext);
        var createdOrder = await createHandler.Handle(new CreateClinicLabOrderCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Elena Ramos"
        ), CancellationToken.None);

        var publicUploadHandler = new SubmitPublicLabUploadCommandHandler(orderRepo, unitOfWork);
        var uploadCommand = new SubmitPublicLabUploadCommand(
            Token: createdOrder.PublicUploadToken!,
            ExternalLabName: "St. Luke's Diagnostic Lab",
            DocumentType: "PDF",
            DocumentUrl: "https://storage.clinicez.com/docs/report-001.pdf",
            FileBase64: null,
            Notes: "Official certified PDF attached by lab staff",
            UploadedBy: "ExternalLab"
        );

        var uploaded = await publicUploadHandler.Handle(uploadCommand, CancellationToken.None);

        uploaded.Status.Should().Be(LabOrderStatus.CompletedWithExternalReport);
        uploaded.ExternalLabName.Should().Be("St. Luke's Diagnostic Lab");
        uploaded.ExternalReportType.Should().Be("PDF");
        uploaded.UploadedBy.Should().Be("ExternalLab");
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

        var createHandler = new CreateClinicLabOrderCommandHandler(orderRepo, patientRepo, unitOfWork, _clinicContext);
        var createdOrder = await createHandler.Handle(new CreateClinicLabOrderCommand(
            PatientId: patientId,
            PatientName: "Maria Santos",
            ClinicalDiagnosis: "Hypertension Workup",
            Notes: "10-12 hours fasting"
        ), CancellationToken.None);

        var slipHandler = new GetClinicLabOrderSlipQueryHandler(orderRepo, patientRepo, settingsRepo);
        var slip = await slipHandler.Handle(new GetClinicLabOrderSlipQuery(createdOrder.Id), CancellationToken.None);

        slip.Should().NotBeNull();
        slip.OrderNumber.Should().Be(createdOrder.OrderNumber);
        slip.PatientName.Should().Be("Maria Santos");
        slip.PhilHealthNumber.Should().Be("12-050412345-6");
        slip.QrPayload.Should().Contain(createdOrder.OrderNumber);
        slip.PublicUploadToken.Should().Be(createdOrder.PublicUploadToken);
    }
}
