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

public class ClinicCensusChallengerEmpiricalTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-challenger-empirical";
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();
    private readonly IClinicCensusExcelService _excelService = new ClinicCensusExcelService();

    public ClinicCensusChallengerEmpiricalTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
        _clinicContext.StaffName.Returns("Lead Challenger Agent");
    }

    [Fact]
    public async Task EmpiricalTest_FourVisitsSamePatient_StrictEntitySeparationAcrossLifecycle()
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
        var doc1Id = Guid.NewGuid();
        var doc2Id = Guid.NewGuid();
        var nurse1Id = Guid.NewGuid();
        var nurse2Id = Guid.NewGuid();

        var patient = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CHALLENGE-01",
            FirstName = "Maria",
            MiddleName = "Santos",
            LastName = "Correlata",
            DateOfBirth = new DateOnly(1995, 3, 20),
            Sex = BiologicalSex.Female,
            SeniorCitizenId = null,
            PwdId = "PWD-9988",
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09181112222",
            CustomFields = new Dictionary<string, object?>
            {
                ["department"] = "Emergency Medical Services",
                ["special_allergy"] = "Penicillin, Latex"
            }
        };
        await patientRepo.AddAsync(patient);

        // Encounter 1: Morning Consultation with Doc 1 (Dr. Rizal)
        var q1 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            PatientName = "Correlata, Maria S.",
            QueueNumber = "Q-01",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.RoutineCheckup,
            Status = QueueStatus.Completed,
            DoctorId = doc1Id,
            DoctorName = "Dr. Jose Rizal",
            CheckInTime = queryDate.AddHours(8),
            CompletedTime = queryDate.AddHours(8).AddMinutes(35)
        };
        await queueRepo.AddAsync(q1);

        var vitals1 = new PatientVitals
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = q1.Id,
            PatientId = patient.Id,
            NurseId = nurse1Id,
            RecordedByNurseName = "Nurse Clara",
            RecordedAt = queryDate.AddHours(8).AddMinutes(5),
            SystolicBp = 110,
            DiastolicBp = 70,
            HeartRateBpm = 68,
            TemperatureCelsius = 36.6m,
            Notes = "Alert, oriented, stable"
        };
        await vitalsRepo.AddAsync(vitals1);

        var consult1 = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = q1.Id,
            PatientId = patient.Id,
            PatientName = "Correlata, Maria S.",
            DoctorId = doc1Id,
            DoctorName = "Dr. Jose Rizal",
            DoctorPrcLicense = "PRC-001",
            EncounterDate = queryDate.AddHours(8).AddMinutes(15),
            Assessment = "Acute Rhinitis",
            IsSigned = true,
            SignedAt = queryDate.AddHours(8).AddMinutes(35),
            Diagnoses = new List<EncounterDiagnosis>
            {
                new()
                {
                    TenantId = _testTenantId,
                    ClinicId = _testClinicId,
                    Icd10Code = "J00",
                    Description = "Acute nasopharyngitis [common cold]",
                    IsPrimary = true
                }
            }
        };
        await consultRepo.AddAsync(consult1);

        var inv1 = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = q1.Id,
            PatientId = patient.Id,
            PatientName = "Correlata, Maria S.",
            InvoiceNumber = "INV-001",
            GrossAmount = 600m,
            NetAmount = 600m,
            AmountPaid = 600m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            Payments = new List<PaymentRecord>
            {
                new() { PaymentNumber = "OR-101", Amount = 600m, TenantId = _testTenantId, ClinicId = _testClinicId }
            }
        };
        await invoiceRepo.AddAsync(inv1);

        // Encounter 2: Afternoon Standalone Procedure (Wound Dressing by Nurse 2)
        var q2 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            PatientName = "Correlata, Maria S.",
            QueueNumber = "Q-02",
            SequenceNumber = 2,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Urgent,
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Completed,
            CheckInTime = queryDate.AddHours(13),
            CompletedTime = queryDate.AddHours(13).AddMinutes(20)
        };
        await queueRepo.AddAsync(q2);

        var proc2 = new Procedure
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = q2.Id,
            PatientId = patient.Id,
            PatientName = "Correlata, Maria S.",
            ProcedureName = "Complex Wound Dressing",
            Category = "Nursing",
            PerformedByStaffId = nurse2Id,
            PerformedByStaffName = "Nurse Juan",
            ScheduledAt = queryDate.AddHours(13).AddMinutes(5),
            Status = ProcedureStatus.Completed
        };
        await procRepo.AddAsync(proc2);

        // Encounter 3: Laboratory Specimen collection (No doctor, no nurse vitals, unpaid invoice)
        var q3 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            PatientName = "Correlata, Maria S.",
            QueueNumber = "Q-03",
            SequenceNumber = 3,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = (VisitType)7,
            Status = QueueStatus.Completed,
            CheckInTime = queryDate.AddHours(15),
            CompletedTime = queryDate.AddHours(15).AddMinutes(10)
        };
        await queueRepo.AddAsync(q3);

        var inv3 = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = q3.Id,
            PatientId = patient.Id,
            PatientName = "Correlata, Maria S.",
            InvoiceNumber = "INV-003",
            GrossAmount = 350m,
            NetAmount = 350m,
            AmountPaid = 0m,
            BalanceDue = 350m,
            Status = InvoiceStatus.Draft,
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    TenantId = _testTenantId,
                    ClinicId = _testClinicId,
                    Category = "Diagnostic",
                    Description = "Complete Blood Count",
                    Quantity = 1,
                    UnitPrice = 350m,
                    TotalPrice = 350m
                }
            }
        };
        await invoiceRepo.AddAsync(inv3);

        // Encounter 4: Evening Follow-up Consultation with Doc 2 (Dr. Mabini)
        var q4 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            PatientName = "Correlata, Maria S.",
            QueueNumber = "Q-04",
            SequenceNumber = 4,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Urgent,
            VisitType = VisitType.RoutineCheckup,
            Status = QueueStatus.Completed,
            DoctorId = doc2Id,
            DoctorName = "Dr. Apolinario Mabini",
            CheckInTime = queryDate.AddHours(18),
            CompletedTime = queryDate.AddHours(18).AddMinutes(40)
        };
        await queueRepo.AddAsync(q4);

        var vitals4 = new PatientVitals
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = q4.Id,
            PatientId = patient.Id,
            NurseId = nurse1Id,
            RecordedByNurseName = "Nurse Clara",
            RecordedAt = queryDate.AddHours(18).AddMinutes(5),
            SystolicBp = 125,
            DiastolicBp = 82,
            HeartRateBpm = 80,
            Notes = "Re-evaluation after morning care"
        };
        await vitalsRepo.AddAsync(vitals4);

        var consult4 = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = q4.Id,
            PatientId = patient.Id,
            PatientName = "Correlata, Maria S.",
            DoctorId = doc2Id,
            DoctorName = "Dr. Apolinario Mabini",
            DoctorPrcLicense = "PRC-002",
            EncounterDate = queryDate.AddHours(18).AddMinutes(15),
            Assessment = "Bronchitis resolving",
            IsSigned = true,
            SignedAt = queryDate.AddHours(18).AddMinutes(40),
            Diagnoses = new List<EncounterDiagnosis>
            {
                new()
                {
                    TenantId = _testTenantId,
                    ClinicId = _testClinicId,
                    Icd10Code = "J20.9",
                    Description = "Acute bronchitis, unspecified",
                    IsPrimary = true
                }
            }
        };
        await consultRepo.AddAsync(consult4);

        await uow.SaveChangesAsync();

        var handler = new GetClinicCensusReportQueryHandler(
            queueRepo, patientRepo, vitalsRepo, consultRepo, procRepo, invoiceRepo, _clinicContext);

        // Act
        var report = await handler.Handle(
            new GetClinicCensusReportQuery(StartDate: queryDate, EndDate: queryDate),
            CancellationToken.None);

        // Assert
        report.Summary.TotalCensus.Should().Be(4);
        report.Summary.DistinctPatientsCount.Should().Be(1);
        report.Summary.NewPatients.Should().Be(1);
        report.Summary.ReturningPatients.Should().Be(3);
        report.Summary.Consultations.Should().Be(2);
        report.Summary.StandaloneProcedures.Should().Be(1);
        report.Summary.DiagnosticsOrLab.Should().Be(1);
        report.Summary.NonDoctorVisits.Should().Be(2);

        var item1 = report.Items.First(i => i.QueueNumber == "Q-01");
        var item2 = report.Items.First(i => i.QueueNumber == "Q-02");
        var item3 = report.Items.First(i => i.QueueNumber == "Q-03");
        var item4 = report.Items.First(i => i.QueueNumber == "Q-04");

        // Item 1: First lifetime encounter -> New patient
        item1.IsNewPatient.Should().BeTrue();
        item1.AttendingDoctor.Should().Be("Dr. Jose Rizal (PRC: PRC-001)");
        item1.DoctorDiagnosis.Should().Contain("[J00]");
        item1.AttendingNurse.Should().Be("Nurse Clara");
        item1.VitalsSnapshot.Should().Contain("BP 110/70");
        item1.BillingStatus.Should().Be("Paid");
        item1.AmountPaid.Should().Be(600m);
        item1.OfficialReceiptNumber.Should().Be("OR-101");
        item1.TurnaroundMinutes.Should().Be(35);

        // Item 2: Standalone procedure -> Should NOT bleed doctor or vitals or invoice from item 1
        item2.IsNewPatient.Should().BeFalse();
        item2.AttendingDoctor.Should().Be("—");
        item2.DoctorDiagnosis.Should().BeEmpty();
        item2.AttendingNurse.Should().Be("Nurse Juan");
        item2.ProceduresPerformed.Should().Be("Complex Wound Dressing");
        item2.VitalsSnapshot.Should().Be("No vitals recorded");
        item2.BillingStatus.Should().Be("Unbilled");
        item2.AmountPaid.Should().Be(0m);
        item2.TurnaroundMinutes.Should().Be(20);

        // Item 3: Lab Specimen -> Should NOT bleed anything from item 1 or 2
        item3.IsNewPatient.Should().BeFalse();
        item3.AttendingDoctor.Should().Be("—");
        item3.DoctorDiagnosis.Should().BeEmpty();
        item3.AttendingNurse.Should().Be("—");
        item3.ProceduresPerformed.Should().Be("None");
        item3.VitalsSnapshot.Should().Be("No vitals recorded");
        item3.BillingStatus.Should().Be("Unsettled / Promissory");
        item3.AmountPaid.Should().Be(0m);
        item3.TurnaroundMinutes.Should().Be(10);

        // Item 4: Second consultation -> Doctor Mabini, NOT Doctor Rizal
        item4.IsNewPatient.Should().BeFalse();
        item4.AttendingDoctor.Should().Be("Dr. Apolinario Mabini (PRC: PRC-002)");
        item4.DoctorDiagnosis.Should().Contain("[J20.9]");
        item4.DoctorDiagnosis.Should().NotContain("[J00]");
        item4.AttendingNurse.Should().Be("Nurse Clara");
        item4.VitalsSnapshot.Should().Contain("BP 125/82");
        item4.TurnaroundMinutes.Should().Be(40);

        // Average turnaround: (35 + 20 + 10 + 40) / 4 = 105 / 4 = 26.25 -> Banker's rounding to even yields 26.2
        report.Summary.AverageTurnaroundMinutes.Should().Be(26.2);

        // Verify downstream ClosedXML and QuestPDF generation with this 4-visit dataset
        var facility = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Empirical Challenge Clinic",
            AccreditationNumber = "PHIC-EMP-001"
        };

        var excelBytes = _excelService.GenerateClinicCensusExcel(report, facility);
        excelBytes.Should().NotBeNullOrEmpty();
        using var ms = new MemoryStream(excelBytes);
        using var wb = new XLWorkbook(ms);
        wb.Worksheets.Count.Should().Be(2);

        var ws1 = wb.Worksheet("Census Register");
        ws1.Cell(7, 1).GetString().Should().Be("1"); // Q-01
        ws1.Cell(8, 18).GetString().Should().Be("—"); // Q-02 doctor (row 9 is Complex Wound Dressing sub-row)
        ws1.Cell(10, 18).GetString().Should().Be("—"); // Q-03 doctor (row 11 is Complete Blood Count diagnostic sub-row)
        ws1.Cell(12, 18).GetString().Should().Contain("Dr. Apolinario Mabini"); // Q-04 doctor

        var pdfBytes = _pdfService.GenerateClinicCensusReportPdf(report, facility, "Dr. Challenger");
        pdfBytes.Should().NotBeNullOrEmpty();
        Encoding.ASCII.GetString(pdfBytes, 0, 5).Should().Be("%PDF-");
    }

    [Fact]
    public async Task EmpiricalTest_MidnightTurnaround_And_InConsultationWaitingState_Integrity()
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

        var pat = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-MID-WAIT",
            FirstName = "Night",
            LastName = "Owl",
            DateOfBirth = new DateOnly(2000, 1, 1),
            Sex = BiologicalSex.Intersex,
            ContactNumber = "09180003333"
        };
        await patientRepo.AddAsync(pat);

        // Queue item checked in at 23:50 UTC, completed at 01:10 UTC next day (80 mins)
        var q1 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = pat.Id,
            PatientName = "Owl, Night",
            QueueNumber = "Q-NIGHT",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Emergency,
            VisitType = VisitType.RoutineCheckup,
            Status = QueueStatus.Completed,
            CheckInTime = queryDate.AddHours(23).AddMinutes(50),
            CompletedTime = queryDate.AddDays(1).AddHours(1).AddMinutes(10)
        };
        await queueRepo.AddAsync(q1);

        // Queue item 2: Still in consultation (no completion time, no signed consultation)
        var q2 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = pat.Id,
            PatientName = "Owl, Night",
            QueueNumber = "Q-ACTIVE",
            SequenceNumber = 2,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Urgent,
            VisitType = VisitType.RoutineCheckup,
            Status = QueueStatus.InConsultation,
            CheckInTime = queryDate.AddHours(23).AddMinutes(55),
            CompletedTime = null,
            DischargedAt = null
        };
        await queueRepo.AddAsync(q2);

        await uow.SaveChangesAsync();

        var handler = new GetClinicCensusReportQueryHandler(
            queueRepo, patientRepo, vitalsRepo, consultRepo, procRepo, invoiceRepo, _clinicContext);

        // Act
        var report = await handler.Handle(
            new GetClinicCensusReportQuery(StartDate: queryDate, EndDate: queryDate),
            CancellationToken.None);

        // Assert
        report.Summary.TotalCensus.Should().Be(2);
        report.Summary.CompletedVisits.Should().Be(1);
        report.Summary.InConsultationOrWaiting.Should().Be(1);
        report.Summary.AverageTurnaroundMinutes.Should().Be(80.0);

        var item1 = report.Items.First(i => i.QueueNumber == "Q-NIGHT");
        item1.TurnaroundMinutes.Should().Be(80);
        item1.CompletedTime.Should().Be(queryDate.AddDays(1).AddHours(1).AddMinutes(10));

        var item2 = report.Items.First(i => i.QueueNumber == "Q-ACTIVE");
        item2.TurnaroundMinutes.Should().BeNull();
        item2.CompletedTime.Should().BeNull();
        item2.Disposition.Should().Be("InConsultation");

        // Verify ClosedXML handles null turnaround and date formatting
        var facility = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Night Clinic"
        };
        var excelBytes = _excelService.GenerateClinicCensusExcel(report, facility);
        using var ms = new MemoryStream(excelBytes);
        using var wb = new XLWorkbook(ms);
        var ws1 = wb.Worksheet("Census Register");

        // Row 7 is item 1 (completed)
        ws1.Cell(7, 6).GetString().Should().Be("80");
        // Row 8 is item 2 (active)
        ws1.Cell(8, 6).GetString().Should().Be("—");
        ws1.Cell(8, 5).GetString().Should().Be("—");
        ws1.Cell(8, 24).GetString().Should().Be("InConsultation");
    }

    [Fact]
    public async Task EmpiricalTest_ZeroVitals_And_PromissoryUnlinkedBilling_GracefulDegradation()
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

        var pat = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-ZERO-01",
            FirstName = "WalkIn",
            LastName = "ZeroVitals",
            DateOfBirth = new DateOnly(2010, 5, 10), // Age 16 -> Pediatric
            Sex = BiologicalSex.Male,
            ContactNumber = "09180004444"
        };
        await patientRepo.AddAsync(pat);

        // Queue item with chief complaint, but no vitals taken
        var q = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = pat.Id,
            PatientName = "ZeroVitals, WalkIn",
            QueueNumber = "Q-ZERO",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.RoutineCheckup,
            Status = QueueStatus.Completed,
            ChiefComplaint = "Earache following swimming",
            CheckInTime = queryDate.AddHours(10),
            CompletedTime = queryDate.AddHours(10).AddMinutes(25)
        };
        await queueRepo.AddAsync(q);

        // No consultation, no vitals, no procs, no invoice in DB
        await uow.SaveChangesAsync();

        var handler = new GetClinicCensusReportQueryHandler(
            queueRepo, patientRepo, vitalsRepo, consultRepo, procRepo, invoiceRepo, _clinicContext);

        // Act
        var report = await handler.Handle(
            new GetClinicCensusReportQuery(StartDate: queryDate, EndDate: queryDate),
            CancellationToken.None);

        // Assert
        var item = report.Items.Single();
        item.Age.Should().Be(16);
        item.Classification.Should().Be("Pediatric");
        item.NurseAssessment.Should().Be("Earache following swimming", "Fallback to ChiefComplaint when no nurse triage notes exist");
        item.VitalsSnapshot.Should().Be("No vitals recorded");
        item.AttendingDoctor.Should().Be("—");
        item.DoctorDiagnosis.Should().Be("Pending diagnosis");
        item.ClinicalAssessment.Should().Be("—");
        item.SystemsReviewed.Should().Be("None recorded");
        item.ProceduresPerformed.Should().Be("None");
        item.BillingStatus.Should().Be("Unbilled");
        item.AmountPaid.Should().Be(0m);
        item.TurnaroundMinutes.Should().Be(25);

        // Verify PDF and Excel rendering don't crash with null/fallback strings
        var facility = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Pediatric WalkIn Clinic"
        };
        var pdfBytes = _pdfService.GenerateClinicCensusReportPdf(report, facility);
        pdfBytes.Should().NotBeNullOrEmpty();

        var excelBytes = _excelService.GenerateClinicCensusExcel(report, facility);
        excelBytes.Should().NotBeNullOrEmpty();
    }
}
