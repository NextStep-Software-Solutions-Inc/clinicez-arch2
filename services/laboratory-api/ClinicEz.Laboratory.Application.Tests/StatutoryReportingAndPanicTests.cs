using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Reports.Commands;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Infrastructure.Services;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

public class StatutoryReportingAndPanicTests
{
    [Fact]
    public void DiagnosticReportPdfGenerator_Should_Generate_Valid_PDF_Bytes()
    {
        var generator = new DiagnosticReportPdfGenerator();
        var req = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test",
            AccessionNumber = "ACC-PDF-001",
            PatientName = "Liza Soberano",
            PatientAge = 26,
            PatientGender = "Female",
            OrderingFacilityName = "Metro Health Diagnostic",
            OrderingDoctorName = "Dr. Allan Ramos, MD",
            OrderingDoctorPrc = "PRC-0056789",
            Urgency = "STAT",
            Status = RequisitionStatus.Verified,
            AnalyteResults = new List<AnalyteResult>
            {
                new()
                {
                    PanelName = "Complete Blood Count (CBC)",
                    AnalyteCode = "HGB",
                    AnalyteName = "Hemoglobin",
                    Value = "13.5",
                    Unit = "g/dL",
                    ReferenceInterval = "12.0 - 15.5",
                    Flag = AnalyteFlag.Normal
                },
                new()
                {
                    PanelName = "Clinical Chemistry",
                    AnalyteCode = "FBS",
                    AnalyteName = "Fasting Blood Sugar",
                    Value = "450.0",
                    Unit = "mg/dL",
                    ReferenceInterval = "70.0 - 99.0",
                    Flag = AnalyteFlag.Critical
                }
            },
            DiagnosticReport = new DiagnosticReport
            {
                ReportNumber = "RPT-ACC-PDF-001",
                PathologistName = "Dr. Roberto Gomez, MD, FPSP",
                PathologistPrcLicense = "PRC-0089123",
                MedicalTechnologistName = "Carlos Mendoza, RMT",
                MedicalTechnologistPrcLicense = "PRC-0045678",
                PathologistImpression = "Critical hyperglycemia detected."
            }
        };

        var pdfBytes = generator.GeneratePdf(req);

        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(500);

        var pdfText = Encoding.ASCII.GetString(pdfBytes);
        pdfText.Should().StartWith("%PDF-");
        pdfText.Should().Contain("%%EOF");

        // HTML preview retains verifiable full text
        var html = generator.GenerateHtml(req);
        html.Should().Contain("ClinicEz Diagnostic Laboratory");
        html.Should().Contain("DOH-LTO-2026-004412-CL");
        html.Should().Contain("Liza Soberano");
    }

    [Fact]
    public void DiagnosticReportPdfGenerator_Should_Handle_MultiPage_Without_Truncation()
    {
        var generator = new DiagnosticReportPdfGenerator();
        var analytes = new List<AnalyteResult>();
        for (int i = 1; i <= 35; i++)
        {
            analytes.Add(new AnalyteResult
            {
                PanelName = i <= 15 ? "Panel Alpha" : "Panel Beta",
                AnalyteCode = $"TEST-{i:D3}",
                AnalyteName = $"Diagnostic Analyte Parameter #{i} with Long Descriptive Text",
                Value = $"{i * 1.5:F1}",
                Unit = "mg/dL",
                ReferenceInterval = "10.0 - 50.0",
                Flag = i % 5 == 0 ? AnalyteFlag.Critical : (i % 3 == 0 ? AnalyteFlag.High : AnalyteFlag.Normal)
            });
        }

        var req = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test",
            AccessionNumber = "ACC-MULTIPAGE-001",
            PatientName = "Don Niño Dela Cruz",
            PatientAge = 45,
            PatientGender = "Male",
            OrderingFacilityName = "BGC Medical Diagnostics",
            OrderingDoctorName = "Dr. Maria Santos, MD",
            Urgency = "STAT",
            Status = RequisitionStatus.Verified,
            AnalyteResults = analytes,
            DiagnosticReport = new DiagnosticReport
            {
                ReportNumber = "RPT-MULTI-001",
                PathologistName = "Dr. Roberto Gomez, MD, FPSP",
                PathologistPrcLicense = "PRC-0089123",
                MedicalTechnologistName = "Carlos Mendoza, RMT",
                MedicalTechnologistPrcLicense = "PRC-0045678",
                PathologistImpression = "Multi-panel extended metabolic profile verified."
            }
        };

        var customConfig = new ClinicEz.Shared.Documents.Configuration.TenantPrintoutConfig
        {
            FacilityName = "ST. LUKE'S AMBULATORY DIAGNOSTIC CENTER",
            FacilitySubHeader = "Advanced Clinical Chemistry & Molecular Pathology",
            PhysicalAddress = "32nd Street, Bonifacio Global City, Taguig, Philippines",
            ContactNumbers = "(02) 8789-7700",
            DohLicenseToOperate = "DOH-LTO-BGC-9921",
            PhilHealthAccreditationNumber = "PHIC-9921-BGC",
            PrimaryColorHex = "#15803D",
            CustomDisclaimerText = "Official Hospital Electronic Report. Protected by RA 10173."
        };

        var pdfBytes = generator.GeneratePdf(req, customConfig);

        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);
        var pdfText = Encoding.ASCII.GetString(pdfBytes);
        pdfText.Should().StartWith("%PDF-");
        pdfText.Should().Contain("%%EOF");
    }

    [Fact]
    public void DiagnosticReportPdfGenerator_Should_Generate_DOH_Compliant_HTML()
    {
        var generator = new DiagnosticReportPdfGenerator();
        var req = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test",
            AccessionNumber = "ACC-HTML-001",
            PatientName = "Enrique Gil",
            PatientAge = 32,
            PatientGender = "Male",
            OrderingFacilityName = "St. Luke Diagnostic",
            OrderingDoctorName = "Dr. Maria Cruz, MD",
            Urgency = "Routine",
            Status = RequisitionStatus.Verified,
            AnalyteResults = new List<AnalyteResult>
            {
                new()
                {
                    PanelName = "Clinical Chemistry",
                    AnalyteCode = "CREA",
                    AnalyteName = "Serum Creatinine",
                    Value = "0.95",
                    Unit = "mg/dL",
                    ReferenceInterval = "0.7 - 1.3",
                    Flag = AnalyteFlag.Normal
                }
            },
            DiagnosticReport = new DiagnosticReport
            {
                ReportNumber = "RPT-ACC-HTML-001",
                PathologistName = "Dr. Roberto Gomez, MD, FPSP",
                PathologistPrcLicense = "PRC-0089123",
                MedicalTechnologistName = "Carlos Mendoza, RMT",
                MedicalTechnologistPrcLicense = "PRC-0045678"
            }
        };

        var html = generator.GenerateHtml(req);

        html.Should().Contain("ClinicEz Diagnostic Laboratory");
        html.Should().Contain("DOH-LTO-2026-004412-CL");
        html.Should().Contain("PHIC-LAB-992140");
        html.Should().Contain("Enrique Gil");
        html.Should().Contain("Serum Creatinine");
        html.Should().Contain("Carlos Mendoza, RMT");
        html.Should().Contain("Dr. Roberto Gomez, MD, FPSP");
        html.Should().Contain("PRC-0089123");
    }

    [Fact]
    public async Task RecordPanicDispatchCommand_Should_Record_Log_And_Publish_Panic_Event()
    {
        var (db, uow, sieve) = LabTestDbHelper.CreateTestContext();
        var reqRepo = LabTestDbHelper.CreateRepository<LabRequisition>(db, sieve);
        var panicRepo = LabTestDbHelper.CreateRepository<CriticalPanicDispatchLog>(db, sieve);
        var panicPublisher = Substitute.For<IPanicAlertPublisher>();

        var req = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-test",
            AccessionNumber = "ACC-PANIC-001",
            PatientId = Guid.NewGuid(),
            PatientName = "Manny Pacquiao",
            OrderingDoctorName = "Dr. Buboy Fernandez",
            OrderingFacilityName = "Pacquiao Wellness Clinic",
            Status = RequisitionStatus.InTesting,
            AnalyteResults = new List<AnalyteResult>
            {
                new()
                {
                    PanelName = "Clinical Chemistry",
                    AnalyteCode = "K",
                    AnalyteName = "Serum Potassium",
                    Value = "6.9",
                    Unit = "mmol/L",
                    ReferenceInterval = "3.5 - 5.1",
                    Flag = AnalyteFlag.Critical,
                    Interpretation = "CRITICAL PANIC: Value is dangerously elevated."
                }
            }
        };

        await db.LabRequisitions.AddAsync(req);
        await db.SaveChangesAsync();

        var handler = new RecordPanicDispatchCommandHandler(reqRepo, panicRepo, uow, panicPublisher);

        var logDto = await handler.Handle(new RecordPanicDispatchCommand(
            RequisitionId: req.Id,
            DispatchedByMedTechName: "Anna RMT",
            NotifiedDoctorName: "Dr. Buboy Fernandez",
            NotificationMethod: "Telephone",
            ReadbackConfirmed: true,
            ReadbackNotes: "Dr. Fernandez verified and repeated back Potassium = 6.9 mmol/L at 16:45."
        ), CancellationToken.None);

        logDto.AccessionNumber.Should().Be("ACC-PANIC-001");
        logDto.PatientName.Should().Be("Manny Pacquiao");
        logDto.ReadbackConfirmed.Should().BeTrue();
        logDto.CriticalFindings.Should().Contain("Serum Potassium (K) = 6.9 mmol/L");

        // Verify that MassTransit event was published
        await panicPublisher.Received(1).PublishPanicAlertAsync(
            Arg.Is<LabPanicResultAlertEvent>(e =>
                e.AccessionNumber == "ACC-PANIC-001" &&
                e.Urgency == "STAT" &&
                e.CriticalFindings.Count == 1),
            Arg.Any<CancellationToken>());
    }
}
