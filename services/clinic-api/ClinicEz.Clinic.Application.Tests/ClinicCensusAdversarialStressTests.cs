using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using ClosedXML.Excel;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicCensusAdversarialStressTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-stress-census";
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();
    private readonly IClinicCensusExcelService _excelService = new ClinicCensusExcelService();

    public ClinicCensusAdversarialStressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
        _clinicContext.StaffName.Returns("Challenger Nurse Lead");
    }

    [Fact]
    public async Task StressTest_MultiEntityCorrelation_EdgeCases_TurnaroundMidnight_ZeroVitals_And_WalkIns()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var queryDate = new DateTime(2026, 11, 5, 0, 0, 0, DateTimeKind.Utc);

        var nurseId = Guid.NewGuid();
        var docId = Guid.NewGuid();

        // 1. Patient with Midnight Visit (Checked in 23:45, completed 00:30 next day => 45 mins)
        var patMidnight = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-MID-01",
            FirstName = "Nocturnal",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1990, 6, 15),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170001111"
        };
        await patientRepo.AddAsync(patMidnight);

        var qMidnight = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patMidnight.Id,
            PatientName = "Patient, Nocturnal",
            QueueNumber = "Q-MID",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Urgent,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Completed,
            CheckInTime = queryDate.AddHours(23).AddMinutes(45), // 23:45 UTC
            CompletedTime = queryDate.AddDays(1).AddMinutes(30)   // 00:30 UTC next day (45 mins)
        };
        await queueRepo.AddAsync(qMidnight);

        // 2. Patient with Clock Anomaly (Completed before check-in) -> should clamp to 0 turnaround
        var patClockAnomaly = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CLK-02",
            FirstName = "Time",
            LastName = "Traveler",
            DateOfBirth = new DateOnly(1980, 1, 1),
            Sex = BiologicalSex.Female,
            ContactNumber = "09170001112"
        };
        await patientRepo.AddAsync(patClockAnomaly);

        var qClockAnomaly = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patClockAnomaly.Id,
            PatientName = "Traveler, Time",
            QueueNumber = "Q-CLK",
            SequenceNumber = 2,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Completed,
            CheckInTime = queryDate.AddHours(10).AddMinutes(0),
            CompletedTime = queryDate.AddHours(9).AddMinutes(55) // 5 minutes BEFORE check-in
        };
        await queueRepo.AddAsync(qClockAnomaly);

        // 3. Patient with 0 vitals, 0 consult, pure walk-in standalone procedure
        var patProc = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-PRC-03",
            FirstName = "Wound",
            LastName = "Care",
            DateOfBirth = new DateOnly(1975, 5, 20),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170001113"
        };
        await patientRepo.AddAsync(patProc);

        var qProc = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patProc.Id,
            PatientName = "Care, Wound",
            QueueNumber = "Q-PRC",
            SequenceNumber = 3,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.StandaloneProcedure,
            Status = QueueStatus.Completed,
            CheckInTime = queryDate.AddHours(14).AddMinutes(0),
            CompletedTime = queryDate.AddHours(14).AddMinutes(20)
        };
        await queueRepo.AddAsync(qProc);

        var procOnly = new Procedure
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = qProc.Id,
            PatientId = patProc.Id,
            PatientName = "Care, Wound",
            ProcedureName = "Suture Removal",
            Category = "Minor Surgery",
            PerformedByStaffId = nurseId,
            PerformedByStaffName = "Nurse Specialist Rosa",
            ScheduledAt = queryDate.AddHours(14).AddMinutes(5),
            Status = ProcedureStatus.Completed
        };
        await procRepo.AddAsync(procOnly);

        // 4. Same patient returning on the same day (Visit 1 at 08:00, Visit 2 at 16:00)
        var patRepeat = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-RPT-04",
            FirstName = "Twice",
            LastName = "Visited",
            DateOfBirth = new DateOnly(1998, 3, 10),
            Sex = BiologicalSex.Female,
            ContactNumber = "09170001114"
        };
        await patientRepo.AddAsync(patRepeat);

        var qRepeat1 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patRepeat.Id,
            PatientName = "Visited, Twice",
            QueueNumber = "Q-RPT-1",
            SequenceNumber = 4,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Completed,
            CheckInTime = queryDate.AddHours(8).AddMinutes(0),
            CompletedTime = queryDate.AddHours(8).AddMinutes(30)
        };
        var qRepeat2 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patRepeat.Id,
            PatientName = "Visited, Twice",
            QueueNumber = "Q-RPT-2",
            SequenceNumber = 5,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Completed,
            CheckInTime = queryDate.AddHours(16).AddMinutes(0),
            CompletedTime = queryDate.AddHours(16).AddMinutes(25)
        };
        await queueRepo.AddAsync(qRepeat1);
        await queueRepo.AddAsync(qRepeat2);

        // 5. In-flight visit (Waiting, no completion, null turnaround)
        var patWaiting = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-WAI-05",
            FirstName = "Patient",
            LastName = "Waiting",
            DateOfBirth = new DateOnly(2000, 1, 1),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170001115"
        };
        await patientRepo.AddAsync(patWaiting);

        var qWaiting = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patWaiting.Id,
            PatientName = "Waiting, Patient",
            QueueNumber = "Q-WAI",
            SequenceNumber = 6,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Waiting,
            CheckInTime = queryDate.AddHours(17).AddMinutes(0)
            // CompletedTime is null
        };
        await queueRepo.AddAsync(qWaiting);

        await uow.SaveChangesAsync();

        var handler = new GetClinicCensusReportQueryHandler(
            queueRepo, patientRepo, vitalsRepo, consultRepo, procRepo, invoiceRepo, _clinicContext, settingsRepo);

        // Act
        var report = await handler.Handle(
            new GetClinicCensusReportQuery(StartDate: queryDate, EndDate: queryDate),
            CancellationToken.None);

        // Assert
        report.Should().NotBeNull();
        report.Summary.TotalCensus.Should().Be(6);
        report.Summary.DistinctPatientsCount.Should().Be(5); // 5 distinct patients, 6 visits

        // Midnight turnaround: 23:45 to 00:30 next day = exactly 45 mins
        var midnightItem = report.Items.First(i => i.QueueNumber == "Q-MID");
        midnightItem.TurnaroundMinutes.Should().Be(45);

        // Clock anomaly turnaround: completed before checkin clamped to 0 mins
        var clockItem = report.Items.First(i => i.QueueNumber == "Q-CLK");
        clockItem.TurnaroundMinutes.Should().Be(0);

        // Walk-in standalone procedure: 0 vitals, 0 consult
        var procItem = report.Items.First(i => i.QueueNumber == "Q-PRC");
        procItem.TurnaroundMinutes.Should().Be(20);
        procItem.VitalsSnapshot.Should().Be("No vitals recorded");
        procItem.DoctorDiagnosis.Should().BeEmpty();
        procItem.AttendingNurse.Should().Be("Nurse Specialist Rosa");
        procItem.ProceduresPerformed.Should().Be("Suture Removal");

        // Repeat patient on same day:
        // Visit 1 is New, Visit 2 is Returning
        var repeatItem1 = report.Items.First(i => i.QueueNumber == "Q-RPT-1");
        var repeatItem2 = report.Items.First(i => i.QueueNumber == "Q-RPT-2");
        repeatItem1.IsNewPatient.Should().BeTrue();
        repeatItem2.IsNewPatient.Should().BeFalse();

        // In-flight waiting visit
        var waitingItem = report.Items.First(i => i.QueueNumber == "Q-WAI");
        waitingItem.TurnaroundMinutes.Should().BeNull();
        waitingItem.Disposition.Should().Be("Waiting");

        // Average Turnaround should only consider the 5 completed items:
        // (45 + 0 + 20 + 30 + 25) / 5 = 120 / 5 = 24.0 mins
        report.Summary.AverageTurnaroundMinutes.Should().Be(24.0);
        report.Summary.InConsultationOrWaiting.Should().Be(1);
    }

    [Fact]
    public void StressTest_ClosedXML_WorkbookIntegrity_25Columns_FrozenRow_AndAutoFilters()
    {
        // Arrange - generate 100 diverse rows to stress-test layout, auto-filters, styles
        var items = new List<CensusItemDto>();
        for (int i = 1; i <= 100; i++)
        {
            int? turnaround = (i % 7 == 0) ? null : (15 + (i * 2));
            DateTime? completed = turnaround.HasValue ? DateTime.UtcNow.AddMinutes(turnaround.Value) : null;
            decimal amount = (i % 3 == 0) ? 0m : (350m + i * 10);

            items.Add(new CensusItemDto(
                SequenceNumber: i,
                CheckInTime: DateTime.UtcNow.AddMinutes(-i * 10),
                TriageTime: DateTime.UtcNow.AddMinutes(-i * 10 + 5),
                CalledTime: DateTime.UtcNow.AddMinutes(-i * 10 + 10),
                CompletedTime: completed,
                TurnaroundMinutes: turnaround,
                QueueNumber: $"Q-{i:000}",
                PatientCode: $"PAT-{i:0000}",
                PatientName: $"Patient Name #{i}, Filipino Ñ / Special-Char",
                Age: 5 + (i % 75),
                Sex: i % 2 == 0 ? "Female" : "Male",
                CivilStatus: i % 2 == 0 ? "Married" : "Single",
                Classification: i % 5 == 0 ? "Senior, PhilHealth" : (i % 7 == 0 ? "PWD" : "Regular"),
                CustomFields: new Dictionary<string, object?> { ["barangay"] = "Barangay 123", ["notes"] = "VIP Patient" },
                CustomFieldsSummary: "barangay: Barangay 123; notes: VIP Patient",
                VisitType: i % 4 == 0 ? "StandaloneProcedure" : "Consultation",
                ChiefComplaint: $"Adversarial Chief Complaint #{i}",
                NurseAssessment: $"Nurse Assessment Impression #{i}",
                AttendingNurse: $"Nurse Staff {i % 5}",
                VitalsSnapshot: "BP 120/80, HR 80bpm, RR 18cpm, T 36.6°C",
                AttendingDoctor: $"Dr. Attending #{i % 3} (PRC: 12345)",
                DoctorDiagnosis: $"[Z00.0] General Medical Exam #{i} (Primary)",
                ClinicalAssessment: $"Clinical Impression Assessment #{i}",
                SystemsReviewed: "Cardiorespiratory: Normal; Gastrointestinal: Normal",
                ProceduresPerformed: i % 4 == 0 ? "Procedure A" : "None",
                Acuity: (i % 10 == 0) ? "Emergency" : ((i % 5 == 0) ? "Urgent" : "Routine"),
                Disposition: (i % 7 == 0) ? "Waiting" : "Treated & Discharged",
                BillingStatus: (amount > 0) ? "Paid" : "Zero-Balance / PhilHealth",
                OfficialReceiptNumber: (amount > 0) ? $"OR-{i:0000}" : null,
                AmountPaid: amount,
                GrossAmount: amount,
                NetAmount: amount,
                BalanceDue: 0m,
                IsNewPatient: i % 2 == 1
            ));
        }

        var report = new ClinicCensusReportDto(
            StartDate: DateTime.UtcNow.Date.AddDays(-30),
            EndDate: DateTime.UtcNow.Date,
            TenantId: _testTenantId,
            ClinicId: _testClinicId,
            ClinicName: "Stress Test Health System",
            GeneratedAt: DateTime.UtcNow,
            Summary: new CensusSummaryDto(100, 50, 50, 75, 25, 0, 25, 85, 15, 0, 0, 42.5, 90),
            Demographics: new CensusDemographicsBreakdownDto(15, 15.0, 60, 60.0, 25, 25.0, 50, 50.0, 50, 50.0, 0, 0, 25, 14, 20),
            Acuity: new CensusAcuityBreakdownDto(70, 70.0, 20, 20.0, 10, 10.0),
            VisitTypes: new List<CensusVisitTypeBreakdownDto>
            {
                new("Consultation", 75, 75.0),
                new("StandaloneProcedure", 25, 25.0)
            },
            Providers: new List<CensusProviderBreakdownDto>
            {
                new("Dr. Attending #0", "Doctor", 30, 25),
                new("Nurse Staff 1", "Nurse", 20, 20)
            },
            Items: items
        );

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Stress Test Health System",
            AccreditationNumber = "PHIC-999-STRESS",
            TaxIdentificationNumber = "999-888-777-000",
            LetterheadAddress = "100 Ayala Avenue, Makati City",
            LetterheadContact = "+63 2 8123 4567"
        };

        // Act
        var excelBytes = _excelService.GenerateClinicCensusExcel(report, settings);

        // Assert
        excelBytes.Should().NotBeNull();
        excelBytes.Length.Should().BeGreaterThan(5000);

        using var ms = new MemoryStream(excelBytes);
        using var workbook = new XLWorkbook(ms);

        // Verify Worksheets exist
        workbook.Worksheets.Count.Should().Be(2);
        workbook.Worksheets.Should().Contain(ws => ws.Name == "Census Register");
        workbook.Worksheets.Should().Contain(ws => ws.Name == "Executive Summary & Statistics");

        var ws1 = workbook.Worksheet("Census Register");

        // 1. Frozen Header row check
        ws1.SheetView.SplitRow.Should().Be(6, "Row 6 must be frozen for institutional reporting");

        // 2. AutoFilter check
        ws1.AutoFilter.IsEnabled.Should().BeTrue("AutoFilter must be active on data table");
        ws1.AutoFilter.Range.RangeAddress.FirstAddress.RowNumber.Should().Be(6);
        ws1.AutoFilter.Range.RangeAddress.LastAddress.RowNumber.Should().Be(106); // 6 header + 100 rows
        ws1.AutoFilter.Range.RangeAddress.LastAddress.ColumnNumber.Should().Be(25);

        // 3. Exact 25 column headers verification
        string[] expected25Headers =
        {
            "Seq #",
            "Check-In Time",
            "Triage Time",
            "Call Time",
            "Completed Time",
            "Turnaround (Mins)",
            "Ticket No.",
            "Patient Code",
            "Patient Name",
            "Age / Sex / Civil Status",
            "Classification",
            "Custom Fields",
            "Service Availed",
            "Chief Complaint",
            "Nurse Assessment / Impression",
            "Attending Nurse",
            "Vitals Snapshot",
            "Attending Doctor",
            "Doctor Diagnosis & ICD-10",
            "Clinical Assessment",
            "Systems Reviewed & Physical Findings",
            "Service & Procedure Details",
            "Acuity / Priority",
            "Disposition / Outcome",
            "Billing Status / OR # / Amount Paid"
        };

        for (int c = 1; c <= 25; c++)
        {
            var headerCell = ws1.Cell(6, c);
            headerCell.GetString().Should().Be(expected25Headers[c - 1]);
            headerCell.Style.Font.Bold.Should().BeTrue();
            headerCell.Style.Fill.BackgroundColor.Color.R.Should().Be(0x1E);
            headerCell.Style.Fill.BackgroundColor.Color.G.Should().Be(0x3A);
            headerCell.Style.Fill.BackgroundColor.Color.B.Should().Be(0x8A);
            headerCell.Style.Font.FontColor.Color.R.Should().Be(255);
        }

        // 4. Verify Row data integrity
        ws1.Cell(7, 1).GetDouble().Should().Be(1);
        ws1.Cell(106, 1).GetDouble().Should().Be(100);
        ws1.Cell(7, 25).GetString().Should().Contain("₱");

        // 5. Verify Sheet 2 Executive Summary tables
        var ws2 = workbook.Worksheet("Executive Summary & Statistics");
        ws2.Cell(7, 1).GetString().Should().Be("Total Outpatient Census");
        ws2.Cell(7, 2).GetString().Should().Be("100");
    }

    [Fact]
    public void StressTest_QuestPDF_LandscapeMultiPage_DocumentIntegrity_And_Headers()
    {
        // Arrange - generate 75 rows to force multiple landscape pages
        var items = new List<CensusItemDto>();
        for (int i = 1; i <= 75; i++)
        {
            items.Add(new CensusItemDto(
                SequenceNumber: i,
                CheckInTime: DateTime.UtcNow.AddMinutes(-i * 10),
                TriageTime: DateTime.UtcNow.AddMinutes(-i * 10 + 5),
                CalledTime: DateTime.UtcNow.AddMinutes(-i * 10 + 10),
                CompletedTime: DateTime.UtcNow.AddMinutes(-i * 10 + 40),
                TurnaroundMinutes: 40,
                QueueNumber: $"Q-{i:000}",
                PatientCode: $"PAT-{i:0000}",
                PatientName: $"Patient Stress #{i}",
                Age: 10 + (i % 65),
                Sex: i % 2 == 0 ? "Female" : "Male",
                CivilStatus: "Single",
                Classification: "Regular",
                CustomFields: new Dictionary<string, object?>(),
                CustomFieldsSummary: "None",
                VisitType: "Consultation",
                ChiefComplaint: "Routine Health Checkup",
                NurseAssessment: "Normal",
                AttendingNurse: "Nurse Jane",
                VitalsSnapshot: "BP 110/70, HR 70bpm",
                AttendingDoctor: "Dr. Smith (PRC: 11223)",
                DoctorDiagnosis: "[Z00.0] General Medical Examination",
                ClinicalAssessment: "Good health",
                SystemsReviewed: "Cardiorespiratory: Normal",
                ProceduresPerformed: "None",
                Acuity: "Routine",
                Disposition: "Treated & Discharged",
                BillingStatus: "Paid",
                OfficialReceiptNumber: $"OR-{i}",
                AmountPaid: 500m,
                GrossAmount: 500m,
                NetAmount: 500m,
                BalanceDue: 0m,
                IsNewPatient: true
            ));
        }

        var report = new ClinicCensusReportDto(
            StartDate: DateTime.UtcNow.Date.AddDays(-7),
            EndDate: DateTime.UtcNow.Date,
            TenantId: _testTenantId,
            ClinicId: _testClinicId,
            ClinicName: "St. Jude Hospital & Outpatient Center",
            GeneratedAt: DateTime.UtcNow,
            Summary: new CensusSummaryDto(75, 75, 0, 75, 0, 0, 0, 75, 0, 0, 0, 40.0, 75),
            Demographics: new CensusDemographicsBreakdownDto(10, 13.3, 50, 66.7, 15, 20.0, 40, 53.3, 35, 46.7, 0, 0, 15, 0, 0),
            Acuity: new CensusAcuityBreakdownDto(75, 100.0, 0, 0, 0, 0),
            VisitTypes: new List<CensusVisitTypeBreakdownDto> { new("Consultation", 75, 100.0) },
            Providers: new List<CensusProviderBreakdownDto> { new("Dr. Smith", "Doctor", 75, 75) },
            Items: items
        );

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "St. Jude Hospital & Outpatient Center",
            AccreditationNumber = "PHIC-992211",
            LetterheadAddress = "Cebu City, Philippines",
            LetterheadContact = "+63 32 255 1234",
            DefaultApproverName = "Dr. Roberto Santos, MD, FPCP",
            DefaultApproverTitle = "Medical Director"
        };

        // Act
        var pdfBytes = _pdfService.GenerateClinicCensusReportPdf(report, settings, "Maria Clara, RN");

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(10000); // 75 rows across multiple landscape pages > 10KB

        // Verify valid PDF file header and trailer
        var header = Encoding.ASCII.GetString(pdfBytes, 0, 5);
        header.Should().Be("%PDF-");

        var trailer = Encoding.ASCII.GetString(pdfBytes, pdfBytes.Length - 100, 100);
        trailer.Should().Contain("%%EOF");
    }

    [Fact]
    public async Task StressTest_MultipleVisitsSamePatient_EntityCorrelationIsolation()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var queryDate = new DateTime(2026, 11, 5, 0, 0, 0, DateTimeKind.Utc);
        var docId = Guid.NewGuid();
        var nurseId = Guid.NewGuid();

        var patient = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-ISO-01",
            FirstName = "Juan",
            LastName = "Isolator",
            DateOfBirth = new DateOnly(1985, 4, 12),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170009999"
        };
        await patientRepo.AddAsync(patient);

        // Visit 1: Morning Consultation with Dr. Rizal
        var q1 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            PatientName = "Isolator, Juan",
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Completed,
            DoctorId = docId,
            DoctorName = "Dr. Jose Rizal",
            CheckInTime = queryDate.AddHours(8),
            CompletedTime = queryDate.AddHours(8).AddMinutes(30)
        };
        await queueRepo.AddAsync(q1);

        var vitals1 = new PatientVitals
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = q1.Id,
            PatientId = patient.Id,
            NurseId = nurseId,
            RecordedByNurseName = "Nurse Clara",
            RecordedAt = queryDate.AddHours(8).AddMinutes(5),
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 75
        };
        await vitalsRepo.AddAsync(vitals1);

        var consult1 = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = q1.Id,
            PatientId = patient.Id,
            PatientName = "Isolator, Juan",
            DoctorId = docId,
            DoctorName = "Dr. Jose Rizal",
            DoctorPrcLicense = "0012345",
            EncounterDate = queryDate.AddHours(8).AddMinutes(15),
            Assessment = "Upper Respiratory Tract Infection",
            IsSigned = true,
            SignedAt = queryDate.AddHours(8).AddMinutes(30),
            Diagnoses = new List<EncounterDiagnosis>
            {
                new()
                {
                    TenantId = _testTenantId,
                    ClinicId = _testClinicId,
                    Icd10Code = "J06.9",
                    Description = "Acute upper respiratory infection",
                    IsPrimary = true
                }
            }
        };
        await consultRepo.AddAsync(consult1);

        var invoice1 = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = q1.Id,
            PatientId = patient.Id,
            PatientName = "Isolator, Juan",
            InvoiceNumber = "INV-001",
            InvoiceDate = queryDate.AddHours(8).AddMinutes(35),
            GrossAmount = 500m,
            NetAmount = 500m,
            AmountPaid = 500m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid
        };
        await invoiceRepo.AddAsync(invoice1);

        // Visit 2: Afternoon Standalone Procedure by Nurse Clara, NO doctor, NO vitals, NO invoice
        var q2 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            PatientName = "Isolator, Juan",
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.StandaloneProcedure,
            Status = QueueStatus.Completed,
            CheckInTime = queryDate.AddHours(14),
            CompletedTime = queryDate.AddHours(14).AddMinutes(15)
        };
        await queueRepo.AddAsync(q2);

        var proc2 = new Procedure
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = q2.Id,
            PatientId = patient.Id,
            PatientName = "Isolator, Juan",
            ProcedureName = "Tetanus Toxoid Injection",
            Category = "Immunization",
            PerformedByStaffId = nurseId,
            PerformedByStaffName = "Nurse Clara",
            ScheduledAt = queryDate.AddHours(14).AddMinutes(5),
            Status = ProcedureStatus.Completed
        };
        await procRepo.AddAsync(proc2);

        await uow.SaveChangesAsync();

        var handler = new GetClinicCensusReportQueryHandler(
            queueRepo, patientRepo, vitalsRepo, consultRepo, procRepo, invoiceRepo, _clinicContext);

        // Act
        var report = await handler.Handle(
            new GetClinicCensusReportQuery(StartDate: queryDate, EndDate: queryDate),
            CancellationToken.None);

        // Assert
        var item1 = report.Items.First(i => i.QueueNumber == "Q-001");
        var item2 = report.Items.First(i => i.QueueNumber == "Q-002");

        // Item 1 assertions
        item1.AttendingDoctor.Should().Contain("Dr. Jose Rizal");
        item1.DoctorDiagnosis.Should().Contain("[J06.9]");
        item1.BillingStatus.Should().Be("Paid");
        item1.AmountPaid.Should().Be(500m);

        // Item 2 assertions - should NOT inherit Item 1's doctor diagnosis, vitals, or invoice!
        item2.VisitType.Should().Be("StandaloneProcedure");
        item2.ProceduresPerformed.Should().Be("Tetanus Toxoid Injection");
        item2.AttendingDoctor.Should().Be("—", "Visit 2 was a standalone nursing procedure and should not inherit Visit 1's doctor");
        item2.DoctorDiagnosis.Should().BeEmpty("Visit 2 was not a doctor consultation and non-diagnosis cells must remain blank");
        item2.BillingStatus.Should().Be("Unbilled", "Visit 2 has no invoice");
        item2.AmountPaid.Should().Be(0m);
    }

    [Fact]
    public async Task StressTest_TurnaroundAndCompletedTime_SignedAtFallbackConsistency()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var queryDate = new DateTime(2026, 11, 5, 0, 0, 0, DateTimeKind.Utc);
        var docId = Guid.NewGuid();

        var patient = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CMP-01",
            FirstName = "Signed",
            LastName = "Only",
            DateOfBirth = new DateOnly(1992, 8, 14),
            Sex = BiologicalSex.Female,
            ContactNumber = "09170008888"
        };
        await patientRepo.AddAsync(patient);

        // Queue item has no CompletedTime or DischargedAt, but Consultation is signed at +45m
        var q = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            PatientName = "Only, Signed",
            QueueNumber = "Q-CMP",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.InConsultation,
            DoctorId = docId,
            DoctorName = "Dr. Rizal",
            CheckInTime = queryDate.AddHours(9),
            CompletedTime = null,
            DischargedAt = null
        };
        await queueRepo.AddAsync(q);

        var consult = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = q.Id,
            PatientId = patient.Id,
            PatientName = "Only, Signed",
            DoctorId = docId,
            DoctorName = "Dr. Rizal",
            EncounterDate = queryDate.AddHours(9).AddMinutes(10),
            Assessment = "Pharyngitis",
            IsSigned = true,
            SignedAt = queryDate.AddHours(9).AddMinutes(45) // 45 mins after check-in
        };
        await consultRepo.AddAsync(consult);
        await uow.SaveChangesAsync();

        var handler = new GetClinicCensusReportQueryHandler(
            queueRepo, patientRepo, vitalsRepo, consultRepo, procRepo, invoiceRepo, _clinicContext);

        // Act
        var report = await handler.Handle(
            new GetClinicCensusReportQuery(StartDate: queryDate, EndDate: queryDate),
            CancellationToken.None);

        // Assert
        var item = report.Items.First();
        item.TurnaroundMinutes.Should().Be(45);

        // Inconsistency check: If TurnaroundMinutes was derived from consult.SignedAt (45 mins),
        // CompletedTime should also reflect completion rather than remaining null.
        item.CompletedTime.Should().Be(consult.SignedAt, "Item CompletedTime should reflect the resolved completion timestamp");
        report.Summary.CompletedVisits.Should().Be(1, "Completed visits telemetry count should match the number of visits with completed turnaround");
    }
}
