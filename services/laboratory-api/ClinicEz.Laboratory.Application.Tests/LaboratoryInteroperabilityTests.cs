using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Analytes.Commands;
using ClinicEz.Laboratory.Application.Features.Reports.Commands;
using ClinicEz.Laboratory.Application.Features.Requisitions.Commands;
using ClinicEz.Laboratory.Application.Features.Requisitions.Queries;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Services;
using ClinicEz.Laboratory.Infrastructure.Consumers;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

public class LaboratoryInteroperabilityTests
{
    [Fact]
    public void ReferenceRangeEvaluator_Should_Detect_Normal_And_Panic_Values()
    {
        // Normal Male HGB (13.5 - 17.5)
        var (normalFlag, _) = ReferenceRangeEvaluator.Evaluate("HGB", "14.2", "Male");
        normalFlag.Should().Be(AnalyteFlag.Normal);

        // Low Male HGB
        var (lowFlag, _) = ReferenceRangeEvaluator.Evaluate("HGB", "11.0", "Male");
        lowFlag.Should().Be(AnalyteFlag.Low);

        // Critical Low Male HGB (<= 7.0)
        var (critLowFlag, alertNote) = ReferenceRangeEvaluator.Evaluate("HGB", "5.8", "Male");
        critLowFlag.Should().Be(AnalyteFlag.Critical);
        alertNote.Should().Contain("CRITICAL PANIC");

        // Critical High FBS (>= 400.0)
        var (critHighFbs, fbsAlert) = ReferenceRangeEvaluator.Evaluate("FBS", "450.0", "Female");
        critHighFbs.Should().Be(AnalyteFlag.Critical);
        fbsAlert.Should().Contain("CRITICAL PANIC");
    }

    [Fact]
    public async Task AccessionSpecimenCommand_Should_Update_Specimen_And_Requisition_Status()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var repo = LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve);

        var req = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            AccessionNumber = "REQ-2026-0001",
            PatientName = "Juan Dela Cruz",
            Status = RequisitionStatus.PendingAccession,
            Specimens = new List<Specimen>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    Barcode = "REQ-2026-0001-S01",
                    ContainerType = SpecimenContainerType.Purple_EDTA,
                    SpecimenType = "WholeBlood",
                    Status = SpecimenStatus.Pending
                }
            }
        };
        await db.LabRequisitions.AddAsync(req);
        await db.SaveChangesAsync();

        var handler = new AccessionSpecimenCommandHandler(repo, uow);
        var command = new AccessionSpecimenCommand(
            req.Id,
            "MedTech Anna Phleb",
            new List<SpecimenAccessionInput>
            {
                new()
                {
                    SpecimenId = req.Specimens[0].Id,
                    Barcode = "REQ-2026-0001-S01",
                    Notes = "Collected cleanly left antecubital"
                }
            }
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be(RequisitionStatus.SpecimenCollected.ToString());
        result.Specimens.First().Status.Should().Be(SpecimenStatus.Collected.ToString());
        result.Specimens.First().CollectedByPhlebotomistName.Should().Be("MedTech Anna Phleb");

        var updated = await db.LabRequisitions.Include(r => r.Specimens).FirstAsync(r => r.Id == req.Id);
        updated.Status.Should().Be(RequisitionStatus.SpecimenCollected);
    }

    [Fact]
    public async Task RecordAnalyteResultCommand_Should_AutoEvaluate_Flags_And_Intervals()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var repo = LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve);

        var req = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            AccessionNumber = "REQ-2026-0002",
            PatientName = "Maria Santos",
            PatientGender = "Female",
            Status = RequisitionStatus.SpecimenCollected
        };
        await db.LabRequisitions.AddAsync(req);
        await db.SaveChangesAsync();

        var handler = new RecordAnalyteResultCommandHandler(repo, uow);
        var command = new RecordAnalyteResultCommand(
            req.Id,
            "MedTech Carlo RMT",
            new List<AnalyteResultInput>
            {
                new()
                {
                    PanelName = "Complete Blood Count (CBC)",
                    AnalyteCode = "HGB",
                    Value = "13.0"
                },
                new()
                {
                    PanelName = "Clinical Chemistry",
                    AnalyteCode = "FBS",
                    Value = "420.0" // Panic High
                }
            }
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be(RequisitionStatus.InTesting.ToString());
        result.AnalyteResults.Should().HaveCount(2);

        var hgb = result.AnalyteResults.First(a => a.AnalyteCode == "HGB");
        hgb.Flag.Should().Be(AnalyteFlag.Normal.ToString());
        hgb.Unit.Should().Be("g/dL");

        var fbs = result.AnalyteResults.First(a => a.AnalyteCode == "FBS");
        fbs.Flag.Should().Be(AnalyteFlag.Critical.ToString());
        fbs.Interpretation.Should().Contain("CRITICAL PANIC");
    }

    [Fact]
    public async Task VerifyAndSignReportCommand_Should_Generate_Report_And_Publish_Event()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var repo = LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve);
        var reportPublisher = Substitute.For<IDiagnosticReportPublisher>();

        var req = new LabRequisition
        {
            Id = Guid.NewGuid(),
            ExternalRequisitionId = Guid.NewGuid(),
            TenantId = "tenant-1",
            AccessionNumber = "REQ-2026-0003",
            PatientName = "Pedro Penduko",
            Status = RequisitionStatus.InTesting,
            AnalyteResults = new List<AnalyteResult>
            {
                new()
                {
                    PanelName = "Clinical Chemistry",
                    AnalyteCode = "FBS",
                    AnalyteName = "Fasting Blood Sugar",
                    Value = "420.0",
                    Unit = "mg/dL",
                    ReferenceInterval = "70.0 - 99.0",
                    Flag = AnalyteFlag.Critical
                }
            }
        };
        await db.LabRequisitions.AddAsync(req);
        await db.SaveChangesAsync();

        var pdfGen = new ClinicEz.Laboratory.Infrastructure.Services.DiagnosticReportPdfGenerator();
        var handler = new VerifyAndSignReportCommandHandler(repo, uow, reportPublisher, pdfGen);
        var command = new VerifyAndSignReportCommand(
            req.Id,
            "Dr. Roberto Gomez, MD, FPSP",
            "PRC-0089123",
            "Carlos Mendoza, RMT",
            "PRC-0045678",
            "Severe hyperglycemia detected. Immediate clinical correlation required.",
            "JVBERi0xLjQKJcTl8uXr..."
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be(RequisitionStatus.Verified.ToString());
        result.DiagnosticReport.Should().NotBeNull();
        result.DiagnosticReport!.PathologistName.Should().Be("Dr. Roberto Gomez, MD, FPSP");
        result.DiagnosticReport.PathologistPrcLicense.Should().Be("PRC-0089123");
        result.DiagnosticReport.IsCriticalResult.Should().BeTrue();

        await reportPublisher.Received(1).PublishReportFinalizedAsync(
            Arg.Is<DiagnosticReportFinalizedEvent>(e =>
                e.AccessionNumber == "REQ-2026-0003" &&
                e.IsCriticalResult == true &&
                e.Observations.Count == 1),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task LabRequisitionIssuedConsumer_Should_Ingest_Requisition_And_Specimens()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var repo = LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve);
        var logger = Substitute.For<ILogger<LabRequisitionIssuedConsumer>>();
        var consumer = new LabRequisitionIssuedConsumer(repo, uow, logger);

        var issuedEvent = new LabRequisitionIssuedEvent
        {
            RequisitionId = Guid.NewGuid(),
            AccessionNumber = "REQ-BUS-9999",
            OrderingFacilityId = "facility-clinic-1",
            OrderingFacilityName = "Metro Health Clinic",
            TenantId = "tenant-clinic",
            OrderingDoctor = new OrderingDoctorDto
            {
                DoctorName = "Dr. Alice Tan",
                PrcLicenseNumber = "PRC-0012345"
            },
            Patient = new RequisitionPatientDto
            {
                PatientId = Guid.NewGuid(),
                FullName = "Clara Gomez",
                Age = 28,
                Gender = "Female",
                PhilHealthPin = "01-123456789-0"
            },
            Urgency = "STAT",
            Items = new List<RequisitionItemDto>
            {
                new() { ItemName = "Complete Blood Count (CBC)", Category = "Hematology" },
                new() { ItemName = "Fasting Blood Sugar", Category = "Clinical Chemistry" }
            }
        };

        var context = Substitute.For<ConsumeContext<LabRequisitionIssuedEvent>>();
        context.Message.Returns(issuedEvent);
        context.CancellationToken.Returns(CancellationToken.None);

        await consumer.Consume(context);

        var saved = await db.LabRequisitions.Include(r => r.Specimens).FirstOrDefaultAsync(r => r.AccessionNumber == "REQ-BUS-9999");
        saved.Should().NotBeNull();
        saved!.PatientName.Should().Be("Clara Gomez");
        saved.Urgency.Should().Be("STAT");
        saved.Specimens.Should().HaveCount(2); // One EDTA, one SST
        saved.Specimens.Should().Contain(s => s.ContainerType == SpecimenContainerType.Purple_EDTA);
        saved.Specimens.Should().Contain(s => s.ContainerType == SpecimenContainerType.Yellow_SST);
    }

    [Fact]
    public async Task LabRequisitionIssuedConsumer_Should_Ingest_BranchId_And_Filter_By_Branch()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var repo = LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve);
        var logger = Substitute.For<ILogger<LabRequisitionIssuedConsumer>>();
        var consumer = new LabRequisitionIssuedConsumer(repo, uow, logger);

        var branchAId = Guid.NewGuid().ToString();
        var branchBId = Guid.NewGuid().ToString();

        var eventA = new LabRequisitionIssuedEvent
        {
            RequisitionId = Guid.NewGuid(),
            AccessionNumber = "REQ-BRANCH-A-01",
            OrderingFacilityId = "clinic-branch-a",
            OrderingFacilityName = "Downtown Medical Clinic",
            TenantId = "tenant-downtown",
            BranchId = branchAId,
            OrderingDoctor = new OrderingDoctorDto { DoctorName = "Dr. Branch A" },
            Patient = new RequisitionPatientDto { PatientId = Guid.NewGuid(), FullName = "Patient Branch A" },
            Items = new List<RequisitionItemDto> { new() { ItemName = "CBC", Category = "Hematology" } }
        };

        var eventB = new LabRequisitionIssuedEvent
        {
            RequisitionId = Guid.NewGuid(),
            AccessionNumber = "REQ-BRANCH-B-01",
            OrderingFacilityId = "clinic-branch-b",
            OrderingFacilityName = "Uptown Medical Clinic",
            TenantId = "tenant-downtown",
            BranchId = branchBId,
            OrderingDoctor = new OrderingDoctorDto { DoctorName = "Dr. Branch B" },
            Patient = new RequisitionPatientDto { PatientId = Guid.NewGuid(), FullName = "Patient Branch B" },
            Items = new List<RequisitionItemDto> { new() { ItemName = "Urinalysis", Category = "Clinical Microscopy" } }
        };

        var contextA = Substitute.For<ConsumeContext<LabRequisitionIssuedEvent>>();
        contextA.Message.Returns(eventA);
        contextA.CancellationToken.Returns(CancellationToken.None);
        await consumer.Consume(contextA);

        var contextB = Substitute.For<ConsumeContext<LabRequisitionIssuedEvent>>();
        contextB.Message.Returns(eventB);
        contextB.CancellationToken.Returns(CancellationToken.None);
        await consumer.Consume(contextB);

        var savedA = await db.LabRequisitions.FirstOrDefaultAsync(r => r.AccessionNumber == "REQ-BRANCH-A-01");
        savedA.Should().NotBeNull();
        savedA!.BranchId.Should().Be(branchAId);

        // Verify GetWorklistQuery filtered by branchAId
        var queryHandler = new GetWorklistQueryHandler(repo);
        var worklistA = await queryHandler.Handle(new GetWorklistQuery(BranchId: branchAId), CancellationToken.None);
        worklistA.Should().HaveCount(1);
        worklistA[0].AccessionNumber.Should().Be("REQ-BRANCH-A-01");
        worklistA[0].BranchId.Should().Be(branchAId);
    }
}
