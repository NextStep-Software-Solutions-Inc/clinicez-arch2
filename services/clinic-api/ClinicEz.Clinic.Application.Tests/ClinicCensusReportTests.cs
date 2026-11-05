using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClosedXML.Excel;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicCensusReportTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-census-test";
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();
    private readonly IClinicCensusExcelService _excelService = new ClinicCensusExcelService();

    public ClinicCensusReportTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
        _clinicContext.StaffName.Returns("Nurse Supervisor Anna");
    }

    // =========================================================================
    // PART 1: QUERY & 6-ENTITY CORRELATION CALCULATIONS
    // =========================================================================

    [Fact]
    public async Task GetClinicCensusReport_CalculatesMetrics_Turnaround_Demographics_And_Providers_Accurately()
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
        var startUtc = queryDate;

        // Seed Facility Settings
        var facilitySettings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Metro Health Outpatient Center",
            AccreditationNumber = "PHIC-ACC-99201",
            TaxIdentificationNumber = "TIN-987-654-321-000",
            LetterheadAddress = "456 Roxas Boulevard, Manila",
            LetterheadContact = "+63 2 8888 1234"
        };
        await settingsRepo.AddAsync(facilitySettings);

        var doc1Id = Guid.NewGuid();
        var nurse1Id = Guid.NewGuid();

        // -----------------------------------------------------------------
        // Patient 1: Child (Pediatric, Male, Age 7), First lifetime encounter (New)
        // -----------------------------------------------------------------
        var patient1 = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-PED-001",
            FirstName = "Miguel",
            LastName = "Santos",
            MiddleName = "Cruz",
            DateOfBirth = new DateOnly(2019, 5, 10), // 7 years old on 2026-11-05
            Sex = BiologicalSex.Male,
            CivilStatus = CivilStatus.Single,
            ContactNumber = "09170001001",
            CustomFields = new Dictionary<string, object?>
            {
                ["student_id"] = "STU-2026-101",
                ["school_name"] = "Manila Central School"
            }
        };
        await patientRepo.AddAsync(patient1);

        var qItem1 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient1.Id,
            PatientName = "Santos, Miguel C.",
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Completed,
            DoctorId = doc1Id,
            DoctorName = "Dr. Andres Reyes",
            ChiefComplaint = "Cough and low-grade fever for 3 days",
            CheckInTime = queryDate.AddHours(8).AddMinutes(0),
            CalledTime = queryDate.AddHours(8).AddMinutes(15),
            CompletedTime = queryDate.AddHours(8).AddMinutes(45) // Turnaround = 45 mins
        };
        await queueRepo.AddAsync(qItem1);

        var vitals1 = new PatientVitals
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = qItem1.Id,
            PatientId = patient1.Id,
            NurseId = nurse1Id,
            RecordedByNurseName = "Nurse Clara Bautista",
            RecordedAt = queryDate.AddHours(8).AddMinutes(10),
            SystolicBp = 100,
            DiastolicBp = 65,
            HeartRateBpm = 88,
            RespiratoryRateBreathsPerMin = 20,
            TemperatureCelsius = 37.8m,
            OxygenSaturationPercent = 99m,
            Bmi = 15.6m,
            Notes = "Alert, febrile to touch, clear breath sounds"
        };
        await vitalsRepo.AddAsync(vitals1);

        var consult1 = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = qItem1.Id,
            PatientId = patient1.Id,
            PatientName = "Santos, Miguel C.",
            DoctorId = doc1Id,
            DoctorName = "Dr. Andres Reyes",
            DoctorPrcLicense = "0112233",
            EncounterDate = queryDate.AddHours(8).AddMinutes(20),
            Assessment = "Acute Viral Nasopharyngitis",
            ClinicalDisposition = "Treated & Discharged with Home Care Instructions",
            IsSigned = true,
            SignedAt = queryDate.AddHours(8).AddMinutes(45),
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
            },
            ReviewOfSystemsItems = new List<EncounterReviewOfSystemsItem>
            {
                new()
                {
                    TenantId = _testTenantId,
                    ClinicId = _testClinicId,
                    System = RosSystem.Cardiorespiratory,
                    IsNormal = false,
                    Remarks = "Nasal congestion and rhinorrhea"
                }
            }
        };
        await consultRepo.AddAsync(consult1);

        var invoice1 = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = qItem1.Id,
            PatientId = patient1.Id,
            PatientName = "Santos, Miguel C.",
            InvoiceNumber = "INV-20261105-001",
            InvoiceDate = queryDate.AddHours(8).AddMinutes(50),
            GrossAmount = 500m,
            NetAmount = 500m,
            AmountPaid = 500m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            Payments = new List<PaymentRecord>
            {
                new()
                {
                    TenantId = _testTenantId,
                    ClinicId = _testClinicId,
                    PaymentNumber = "OR-20261105-001",
                    PaymentDate = queryDate.AddHours(8).AddMinutes(50),
                    Amount = 500m,
                    Method = PaymentMethod.Cash
                }
            }
        };
        await invoiceRepo.AddAsync(invoice1);

        // -----------------------------------------------------------------
        // Patient 2: Adult (Female, Age 38, PWD, PhilHealth), Returning patient
        // Had an earlier visit 2 months prior on 2026-09-01
        // -----------------------------------------------------------------
        var patient2 = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-ADU-002",
            FirstName = "Elena",
            LastName = "Mercado",
            MiddleName = "Diaz",
            DateOfBirth = new DateOnly(1988, 3, 14), // 38 years old on 2026-11-05
            Sex = BiologicalSex.Female,
            CivilStatus = CivilStatus.Married,
            ContactNumber = "09170001002",
            PwdId = "PWD-NCR-2025-00441",
            PhilHealthNumber = "PHIC-12-345678901-2"
        };
        await patientRepo.AddAsync(patient2);

        // Historical visit (making this patient a Returning Patient on 2026-11-05)
        var historicalQueueItem = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient2.Id,
            PatientName = "Mercado, Elena D.",
            QueueNumber = "HIST-091",
            SequenceNumber = 91,
            QueueDate = new DateOnly(2026, 9, 1),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Completed,
            CheckInTime = new DateTime(2026, 9, 1, 9, 0, 0, DateTimeKind.Utc),
            CompletedTime = new DateTime(2026, 9, 1, 9, 30, 0, DateTimeKind.Utc)
        };
        await queueRepo.AddAsync(historicalQueueItem);

        var qItem2 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient2.Id,
            PatientName = "Mercado, Elena D.",
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Urgent,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Completed,
            DoctorId = doc1Id,
            DoctorName = "Dr. Andres Reyes",
            ChiefComplaint = "Occipital headache and dizziness",
            CheckInTime = queryDate.AddHours(9).AddMinutes(0),
            CalledTime = queryDate.AddHours(9).AddMinutes(10),
            CompletedTime = queryDate.AddHours(9).AddMinutes(40) // Turnaround = 40 mins
        };
        await queueRepo.AddAsync(qItem2);

        var vitals2 = new PatientVitals
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = qItem2.Id,
            PatientId = patient2.Id,
            NurseId = nurse1Id,
            RecordedByNurseName = "Nurse Clara Bautista",
            RecordedAt = queryDate.AddHours(9).AddMinutes(5),
            SystolicBp = 150,
            DiastolicBp = 95,
            HeartRateBpm = 92,
            RespiratoryRateBreathsPerMin = 18,
            TemperatureCelsius = 36.6m,
            OxygenSaturationPercent = 98m,
            Bmi = 24.2m,
            Notes = "BP elevated, patient anxious, compliant with morning medications"
        };
        await vitalsRepo.AddAsync(vitals2);

        var consult2 = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = qItem2.Id,
            PatientId = patient2.Id,
            PatientName = "Mercado, Elena D.",
            DoctorId = doc1Id,
            DoctorName = "Dr. Andres Reyes",
            DoctorPrcLicense = "0112233",
            EncounterDate = queryDate.AddHours(9).AddMinutes(15),
            Assessment = "Essential Hypertension, uncontrolled; Tension Headache",
            ClinicalDisposition = "Oral Antihypertensive Adjusted; Return for Re-evaluation",
            IsSigned = true,
            SignedAt = queryDate.AddHours(9).AddMinutes(40),
            Diagnoses = new List<EncounterDiagnosis>
            {
                new()
                {
                    TenantId = _testTenantId,
                    ClinicId = _testClinicId,
                    Icd10Code = "I10",
                    Description = "Essential (primary) hypertension",
                    IsPrimary = true
                },
                new()
                {
                    TenantId = _testTenantId,
                    ClinicId = _testClinicId,
                    Icd10Code = "G44.2",
                    Description = "Tension-type headache",
                    IsPrimary = false
                }
            },
            ReviewOfSystemsItems = new List<EncounterReviewOfSystemsItem>
            {
                new()
                {
                    TenantId = _testTenantId,
                    ClinicId = _testClinicId,
                    System = RosSystem.Cardiorespiratory,
                    IsNormal = false,
                    Remarks = "Palpitations on exertion"
                }
            }
        };
        await consultRepo.AddAsync(consult2);

        var invoice2 = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = qItem2.Id,
            PatientId = patient2.Id,
            PatientName = "Mercado, Elena D.",
            InvoiceNumber = "INV-20261105-002",
            InvoiceDate = queryDate.AddHours(9).AddMinutes(45),
            GrossAmount = 700m,
            NetAmount = 560m,
            AmountPaid = 560m,
            BalanceDue = 0m,
            DiscountType = DiscountType.Pwd,
            Status = InvoiceStatus.Paid,
            Payments = new List<PaymentRecord>
            {
                new()
                {
                    TenantId = _testTenantId,
                    ClinicId = _testClinicId,
                    PaymentNumber = "OR-20261105-002",
                    PaymentDate = queryDate.AddHours(9).AddMinutes(45),
                    Amount = 560m,
                    Method = PaymentMethod.GCash
                }
            }
        };
        await invoiceRepo.AddAsync(invoice2);

        // -----------------------------------------------------------------
        // Patient 3: Senior (Male, Age 67, OSCA), Standalone In-Clinic Procedure (New)
        // -----------------------------------------------------------------
        var patient3 = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-SNR-003",
            FirstName = "Rodrigo",
            LastName = "Villanueva",
            DateOfBirth = new DateOnly(1959, 8, 22), // 67 years old on 2026-11-05
            Sex = BiologicalSex.Male,
            CivilStatus = CivilStatus.Widowed,
            ContactNumber = "09170001003",
            SeniorCitizenId = "OSCA-MNL-1959-8821"
        };
        await patientRepo.AddAsync(patient3);

        var qItem3 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient3.Id,
            PatientName = "Villanueva, Rodrigo",
            QueueNumber = "Q-003",
            SequenceNumber = 3,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.StandaloneProcedure,
            Status = QueueStatus.Completed,
            ChiefComplaint = "Wound dressing change on left forearm",
            CheckInTime = queryDate.AddHours(10).AddMinutes(0),
            CalledTime = queryDate.AddHours(10).AddMinutes(5),
            CompletedTime = queryDate.AddHours(10).AddMinutes(25) // Turnaround = 25 mins
        };
        await queueRepo.AddAsync(qItem3);

        var procedure3 = new Procedure
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = qItem3.Id,
            PatientId = patient3.Id,
            PatientName = "Villanueva, Rodrigo",
            ProcedureCode = "PROC-WOUND-01",
            ProcedureName = "Wound Debridement and Sterile Dressing",
            Category = "WoundCare",
            ScheduledAt = queryDate.AddHours(10).AddMinutes(10),
            PerformedAt = queryDate.AddHours(10).AddMinutes(20),
            PerformedByStaffId = nurse1Id,
            PerformedByStaffName = "Nurse Clara Bautista",
            Status = ProcedureStatus.Completed
        };
        await procRepo.AddAsync(procedure3);

        var invoice3 = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = qItem3.Id,
            PatientId = patient3.Id,
            PatientName = "Villanueva, Rodrigo",
            InvoiceNumber = "INV-20261105-003",
            InvoiceDate = queryDate.AddHours(10).AddMinutes(30),
            GrossAmount = 450m,
            NetAmount = 360m,
            AmountPaid = 0m,
            BalanceDue = 360m,
            DiscountType = DiscountType.SeniorCitizen,
            Status = InvoiceStatus.Draft // Unsettled / Promissory
        };
        await invoiceRepo.AddAsync(invoice3);

        // -----------------------------------------------------------------
        // Patient 4: Emergency Acuity -> Diverted to Hospital (New)
        // -----------------------------------------------------------------
        var patient4 = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-EMR-004",
            FirstName = "Corazon",
            LastName = "Aquino",
            DateOfBirth = new DateOnly(1982, 1, 25), // 44 years old (Adult)
            Sex = BiologicalSex.Female,
            CivilStatus = CivilStatus.Married,
            ContactNumber = "09170001004"
        };
        await patientRepo.AddAsync(patient4);

        var qItem4 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient4.Id,
            PatientName = "Aquino, Corazon",
            QueueNumber = "Q-004",
            SequenceNumber = 4,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Emergency,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Diverted,
            ChiefComplaint = "Severe acute crushing chest pain radiating to left arm",
            CheckInTime = queryDate.AddHours(11).AddMinutes(0),
            DivertedToFacility = "Philippine Heart Center",
            TransportMode = "Emergency Ambulance Service",
            DivertedAt = queryDate.AddHours(11).AddMinutes(20)
        };
        await queueRepo.AddAsync(qItem4);

        // -----------------------------------------------------------------
        // Patient 5: Cancelled Queue Item (New)
        // -----------------------------------------------------------------
        var patient5 = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CAN-005",
            FirstName = "Danilo",
            LastName = "Flores",
            DateOfBirth = new DateOnly(1995, 11, 30), // 30 years old (Adult)
            Sex = BiologicalSex.Male,
            CivilStatus = CivilStatus.Single,
            ContactNumber = "09170001005"
        };
        await patientRepo.AddAsync(patient5);

        var qItem5 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient5.Id,
            PatientName = "Flores, Danilo",
            QueueNumber = "Q-005",
            SequenceNumber = 5,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Cancelled,
            CheckInTime = queryDate.AddHours(13).AddMinutes(0)
        };
        await queueRepo.AddAsync(qItem5);

        await uow.SaveChangesAsync();

        // Act
        var handler = new GetClinicCensusReportQueryHandler(
            queueRepo, patientRepo, vitalsRepo, consultRepo, procRepo, invoiceRepo, _clinicContext, settingsRepo);

        var result = await handler.Handle(
            new GetClinicCensusReportQuery(StartDate: startUtc, EndDate: queryDate),
            CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.TenantId.Should().Be(_testTenantId);
        result.ClinicId.Should().Be(_testClinicId);
        result.ClinicName.Should().Be("Metro Health Outpatient Center");

        // Summary Assertions
        var summary = result.Summary;
        summary.TotalCensus.Should().Be(5);
        summary.DistinctPatientsCount.Should().Be(5);
        summary.NewPatients.Should().Be(4); // Patient 1, 3, 4, 5 first checked in today
        summary.ReturningPatients.Should().Be(1); // Patient 2 had earlier check-in on 2026-09-01
        summary.Consultations.Should().Be(4); // Q1, Q2, Q4, Q5
        summary.StandaloneProcedures.Should().Be(1); // Q3
        summary.NonDoctorVisits.Should().Be(1); // Total (5) - Consultations (4) = 1
        summary.CompletedVisits.Should().Be(3); // Q1, Q2, Q3 have CompletedTime
        summary.DivertedVisits.Should().Be(1); // Q4
        summary.CancelledOrNoShow.Should().Be(1); // Q5
        summary.UrgentAcuityCount.Should().Be(1); // Q2
        summary.EmergencyAcuityCount.Should().Be(1); // Q4

        // Turnaround Average: (45 + 40 + 25) / 3 = 110 / 3 = 36.7 mins
        summary.AverageTurnaroundMinutes.Should().Be(36.7);

        // Demographics Assertions
        var demo = result.Demographics;
        demo.PediatricCount.Should().Be(1); // Patient 1 (Age 7)
        demo.PediatricPercentage.Should().Be(20.0);
        demo.SeniorCount.Should().Be(1); // Patient 3 (Age 67)
        demo.SeniorPercentage.Should().Be(20.0);
        demo.AdultCount.Should().Be(3); // Patient 2, 4, 5
        demo.AdultPercentage.Should().Be(60.0);
        demo.MaleCount.Should().Be(3); // Patient 1, 3, 5
        demo.MalePercentage.Should().Be(60.0);
        demo.FemaleCount.Should().Be(2); // Patient 2, 4
        demo.FemalePercentage.Should().Be(40.0);
        demo.PwdCount.Should().Be(1); // Patient 2
        demo.PhilHealthCount.Should().Be(1); // Patient 2

        // Acuity Breakdown
        var acuity = result.Acuity;
        acuity.RoutineCount.Should().Be(3); // Q1, Q3, Q5
        acuity.RoutinePercentage.Should().Be(60.0);
        acuity.UrgentCount.Should().Be(1); // Q2
        acuity.UrgentPercentage.Should().Be(20.0);
        acuity.EmergencyCount.Should().Be(1); // Q4
        acuity.EmergencyPercentage.Should().Be(20.0);

        // Visit Types Breakdown
        result.VisitTypes.Should().Contain(vt => vt.VisitType == "Consultation" && vt.Count == 4 && vt.Percentage == 80.0);
        result.VisitTypes.Should().Contain(vt => vt.VisitType == "StandaloneProcedure" && vt.Count == 1 && vt.Percentage == 20.0);

        // Provider Workload Breakdown
        result.Providers.Should().Contain(p => p.StaffName == "Dr. Andres Reyes" && p.Role == "Doctor" && p.TotalEncounters == 2 && p.CompletedEncounters == 2);
        result.Providers.Should().Contain(p => p.StaffName == "Nurse Clara Bautista" && p.Role == "Nurse" && p.TotalEncounters == 3 && p.CompletedEncounters == 3);

        // 25-Column Register Items Verification
        result.Items.Should().HaveCount(5);

        // Row 1 (Miguel Santos)
        var item1 = result.Items.First(i => i.QueueNumber == "Q-001");
        item1.SequenceNumber.Should().Be(1);
        item1.PatientCode.Should().Be("PAT-PED-001");
        item1.PatientName.Should().Be("Santos, Miguel C.");
        item1.Age.Should().Be(7);
        item1.Sex.Should().Be("Male");
        item1.Classification.Should().Be("Pediatric");
        item1.TurnaroundMinutes.Should().Be(45);
        item1.CustomFieldsSummary.Should().Contain("student id: STU-2026-101");
        item1.CustomFieldsSummary.Should().Contain("school name: Manila Central School");
        item1.NurseAssessment.Should().Contain("Alert, febrile to touch");
        item1.AttendingNurse.Should().Be("Nurse Clara Bautista");
        item1.VitalsSnapshot.Should().Contain("BP 100/65");
        item1.VitalsSnapshot.Should().Contain("HR 88bpm");
        item1.VitalsSnapshot.Should().Contain("RR 20cpm");
        item1.VitalsSnapshot.Should().Contain("T 37.8°C");
        item1.VitalsSnapshot.Should().Contain("SpO2 99%");
        item1.VitalsSnapshot.Should().Contain("BMI 15.6");
        item1.AttendingDoctor.Should().Contain("Dr. Andres Reyes (PRC: 0112233)");
        item1.DoctorDiagnosis.Should().Contain("[J00] Acute nasopharyngitis [common cold] (Primary)");
        item1.ClinicalAssessment.Should().Be("Acute Viral Nasopharyngitis");
        item1.SystemsReviewed.Should().Contain("Cardiorespiratory: Nasal congestion and rhinorrhea");
        item1.Disposition.Should().Be("Treated & Discharged with Home Care Instructions");
        item1.BillingStatus.Should().Be("Paid");
        item1.OfficialReceiptNumber.Should().Be("OR-20261105-001");
        item1.AmountPaid.Should().Be(500m);
        item1.IsNewPatient.Should().BeTrue();

        // Row 2 (Elena Mercado)
        var item2 = result.Items.First(i => i.QueueNumber == "Q-002");
        item2.SequenceNumber.Should().Be(2);
        item2.Age.Should().Be(38);
        item2.Sex.Should().Be("Female");
        item2.Classification.Should().Contain("PWD");
        item2.Classification.Should().Contain("PhilHealth");
        item2.TurnaroundMinutes.Should().Be(40);
        item2.Acuity.Should().Be("Urgent");
        item2.DoctorDiagnosis.Should().Contain("[I10] Essential (primary) hypertension (Primary)");
        item2.DoctorDiagnosis.Should().Contain("[G44.2] Tension-type headache");
        item2.SystemsReviewed.Should().Contain("Cardiorespiratory: Palpitations on exertion");
        item2.IsNewPatient.Should().BeFalse(); // Returning patient

        // Row 3 (Rodrigo Villanueva)
        var item3 = result.Items.First(i => i.QueueNumber == "Q-003");
        item3.Age.Should().Be(67);
        item3.Classification.Should().Contain("Senior");
        item3.VisitType.Should().Be("StandaloneProcedure");
        item3.ProceduresPerformed.Should().Be("Wound Debridement and Sterile Dressing");
        item3.AttendingNurse.Should().Be("Nurse Clara Bautista");
        item3.DoctorDiagnosis.Should().Be("N/A - Non-doctor visit");
        item3.BillingStatus.Should().Be("Unsettled / Promissory");
        item3.BalanceDue.Should().Be(360m);
        item3.AmountPaid.Should().Be(0m);
        item3.IsNewPatient.Should().BeTrue();

        // Row 4 (Corazon Aquino)
        var item4 = result.Items.First(i => i.QueueNumber == "Q-004");
        item4.Acuity.Should().Be("Emergency");
        item4.Disposition.Should().Be("Emergency Diversion to Philippine Heart Center (Emergency Ambulance Service)");
        item4.TurnaroundMinutes.Should().BeNull(); // Never completed
        item4.IsNewPatient.Should().BeTrue();

        // Row 5 (Danilo Flores)
        var item5 = result.Items.First(i => i.QueueNumber == "Q-005");
        item5.Disposition.Should().Be("Cancelled");
        item5.TurnaroundMinutes.Should().BeNull();
        item5.IsNewPatient.Should().BeTrue();
    }

    [Fact]
    public async Task GetClinicCensusReport_WithFilters_FiltersByDoctor_Nurse_VisitType_And_Status()
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
        var doc1 = Guid.NewGuid();
        var doc2 = Guid.NewGuid();
        var nurse1 = Guid.NewGuid();
        var nurse2 = Guid.NewGuid();

        var patientA = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-A",
            FirstName = "Alice",
            LastName = "Tan",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = BiologicalSex.Female,
            ContactNumber = "09170001006"
        };
        var patientB = new Patient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-B",
            FirstName = "Bob",
            LastName = "Chua",
            DateOfBirth = new DateOnly(1985, 2, 2),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170001007"
        };
        await patientRepo.AddAsync(patientA);
        await patientRepo.AddAsync(patientB);

        var qA = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patientA.Id,
            PatientName = "Tan, Alice",
            QueueNumber = "Q-A",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Completed,
            DoctorId = doc1,
            DoctorName = "Dr. One",
            CheckInTime = queryDate.AddHours(8),
            CompletedTime = queryDate.AddHours(8).AddMinutes(30)
        };
        var qB = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patientB.Id,
            PatientName = "Chua, Bob",
            QueueNumber = "Q-B",
            SequenceNumber = 2,
            QueueDate = DateOnly.FromDateTime(queryDate),
            Priority = QueuePriority.Urgent,
            VisitType = VisitType.StandaloneProcedure,
            Status = QueueStatus.Completed,
            DoctorId = doc2,
            DoctorName = "Dr. Two",
            CheckInTime = queryDate.AddHours(9),
            CompletedTime = queryDate.AddHours(9).AddMinutes(20)
        };
        await queueRepo.AddAsync(qA);
        await queueRepo.AddAsync(qB);

        var vitalsA = new PatientVitals
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = qA.Id,
            PatientId = patientA.Id,
            NurseId = nurse1,
            RecordedByNurseName = "Nurse One",
            RecordedAt = queryDate.AddHours(8).AddMinutes(5)
        };
        await vitalsRepo.AddAsync(vitalsA);

        var procB = new Procedure
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueItemId = qB.Id,
            PatientId = patientB.Id,
            PatientName = "Chua, Bob",
            ProcedureName = "Nebulization",
            Category = "Respiratory",
            PerformedByStaffId = nurse2,
            PerformedByStaffName = "Nurse Two",
            ScheduledAt = queryDate.AddHours(9).AddMinutes(10),
            Status = ProcedureStatus.Completed
        };
        await procRepo.AddAsync(procB);
        await uow.SaveChangesAsync();

        var handler = new GetClinicCensusReportQueryHandler(
            queueRepo, patientRepo, vitalsRepo, consultRepo, procRepo, invoiceRepo, _clinicContext);

        // 1. Filter by Doctor
        var doc1Result = await handler.Handle(
            new GetClinicCensusReportQuery(StartDate: queryDate, EndDate: queryDate, DoctorId: doc1),
            CancellationToken.None);
        doc1Result.Items.Should().HaveCount(1);
        doc1Result.Items[0].QueueNumber.Should().Be("Q-A");

        // 2. Filter by Nurse
        var nurse2Result = await handler.Handle(
            new GetClinicCensusReportQuery(StartDate: queryDate, EndDate: queryDate, NurseId: nurse2),
            CancellationToken.None);
        nurse2Result.Items.Should().HaveCount(1);
        nurse2Result.Items[0].QueueNumber.Should().Be("Q-B");

        // 3. Filter by VisitType
        var procResult = await handler.Handle(
            new GetClinicCensusReportQuery(StartDate: queryDate, EndDate: queryDate, VisitType: "StandaloneProcedure"),
            CancellationToken.None);
        procResult.Items.Should().HaveCount(1);
        procResult.Items[0].VisitType.Should().Be("StandaloneProcedure");

        // 4. Filter by Status
        var completedResult = await handler.Handle(
            new GetClinicCensusReportQuery(StartDate: queryDate, EndDate: queryDate, Status: "Completed"),
            CancellationToken.None);
        completedResult.Items.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetClinicCensusReport_EmptyDataset_HandlesGracefullyWithoutZeroDivision()
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
        var handler = new GetClinicCensusReportQueryHandler(
            queueRepo, patientRepo, vitalsRepo, consultRepo, procRepo, invoiceRepo, _clinicContext);

        // Act
        var result = await handler.Handle(
            new GetClinicCensusReportQuery(StartDate: queryDate, EndDate: queryDate),
            CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Summary.TotalCensus.Should().Be(0);
        result.Summary.NewPatients.Should().Be(0);
        result.Summary.ReturningPatients.Should().Be(0);
        result.Summary.AverageTurnaroundMinutes.Should().Be(0.0);
        result.Demographics.PediatricCount.Should().Be(0);
        result.Demographics.PediatricPercentage.Should().Be(0.0);
        result.Demographics.AdultCount.Should().Be(0);
        result.Demographics.SeniorCount.Should().Be(0);
        result.Acuity.RoutineCount.Should().Be(0);
        result.Acuity.UrgentCount.Should().Be(0);
        result.Acuity.EmergencyCount.Should().Be(0);
        result.VisitTypes.Should().BeEmpty();
        result.Providers.Should().BeEmpty();
        result.Items.Should().BeEmpty();
    }

    // =========================================================================
    // PART 2: CLOSEDXML SPREADSHEET GENERATION TESTS
    // =========================================================================

    [Fact]
    public void ClinicCensusExcelService_ShouldGenerateMultiTabWorkbook_With25Columns_FrozenHeader_AndAutoFilter()
    {
        // Arrange
        var report = CreateSampleCensusReport();
        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "St. Luke's Outpatient Care",
            AccreditationNumber = "PHIC-998822",
            TaxIdentificationNumber = "000-111-222-333",
            LetterheadAddress = "Quezon City, Philippines",
            LetterheadContact = "+63 2 8789 0000"
        };

        // Act
        var excelBytes = _excelService.GenerateClinicCensusExcel(report, settings);

        // Assert
        excelBytes.Should().NotBeNull();
        excelBytes.Length.Should().BeGreaterThan(1000);

        using var ms = new MemoryStream(excelBytes);
        using var workbook = new XLWorkbook(ms);

        // 1. Verify Worksheets
        workbook.Worksheets.Should().Contain(ws => ws.Name == "Census Register");
        workbook.Worksheets.Should().Contain(ws => ws.Name == "Executive Summary & Statistics");

        // -------------------------------------------------------------
        // Sheet 1: Census Register
        // -------------------------------------------------------------
        var ws1 = workbook.Worksheet("Census Register");
        ws1.Cell(1, 1).GetString().Should().Be("St. Luke's Outpatient Care");
        ws1.Cell(2, 1).GetString().Should().Contain("PHIC Accreditation: PHIC-998822");
        ws1.Cell(3, 1).GetString().Should().Be("OUTPATIENT CLINIC PATIENT CENSUS REGISTER");

        // 25 Required Column Headers in Row 6
        string[] expectedHeaders =
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
            "Visit Type",
            "Chief Complaint",
            "Nurse Assessment / Impression",
            "Attending Nurse",
            "Vitals Snapshot",
            "Attending Doctor",
            "Doctor Diagnosis & ICD-10",
            "Clinical Assessment",
            "Systems Reviewed & Physical Findings",
            "In-Clinic Procedures Performed",
            "Acuity / Priority",
            "Disposition / Outcome",
            "Billing Status / OR # / Amount Paid"
        };

        expectedHeaders.Length.Should().Be(25);

        for (int c = 0; c < 25; c++)
        {
            var headerCell = ws1.Cell(6, c + 1);
            headerCell.GetString().Should().Be(expectedHeaders[c]);
            headerCell.Style.Font.Bold.Should().BeTrue();
            // Header styling: Navy fill (#1E3A8A) and white text
            headerCell.Style.Fill.BackgroundColor.Color.R.Should().Be(0x1E);
            headerCell.Style.Fill.BackgroundColor.Color.G.Should().Be(0x3A);
            headerCell.Style.Fill.BackgroundColor.Color.B.Should().Be(0x8A);
            headerCell.Style.Font.FontColor.Color.R.Should().Be(255);
            headerCell.Style.Font.FontColor.Color.G.Should().Be(255);
            headerCell.Style.Font.FontColor.Color.B.Should().Be(255);
        }

        // Frozen Header Row
        ws1.SheetView.SplitRow.Should().Be(6);

        // AutoFilter on headers
        ws1.AutoFilter.IsEnabled.Should().BeTrue();

        // Data Row 7
        ws1.Cell(7, 1).GetDouble().Should().Be(1); // Seq #
        ws1.Cell(7, 6).GetDouble().Should().Be(45); // Turnaround mins
        ws1.Cell(7, 7).GetString().Should().Be("Q-001");
        ws1.Cell(7, 8).GetString().Should().Be("PAT-001");
        ws1.Cell(7, 9).GetString().Should().Be("Dela Cruz, Juan");
        ws1.Cell(7, 10).GetString().Should().Be("35y / Male / Married");
        ws1.Cell(7, 11).GetString().Should().Be("PhilHealth");
        ws1.Cell(7, 12).GetString().Should().Contain("Department: Engineering");
        ws1.Cell(7, 13).GetString().Should().Be("Consultation");
        ws1.Cell(7, 17).GetString().Should().Contain("BP 120/80");
        ws1.Cell(7, 18).GetString().Should().Contain("Dr. Jose Rizal");
        ws1.Cell(7, 19).GetString().Should().Contain("[I10] Hypertension");
        ws1.Cell(7, 21).GetString().Should().Contain("Cardiorespiratory: Normal");
        ws1.Cell(7, 23).GetString().Should().Be("Routine");
        ws1.Cell(7, 24).GetString().Should().Be("Treated & Discharged");
        ws1.Cell(7, 25).GetString().Should().Contain("Paid (OR-001) - ₱500.00");

        // -------------------------------------------------------------
        // Sheet 2: Executive Summary & Statistics
        // -------------------------------------------------------------
        var ws2 = workbook.Worksheet("Executive Summary & Statistics");
        ws2.Cell(1, 1).GetString().Should().Be("St. Luke's Outpatient Care");
        ws2.Cell(2, 1).GetString().Should().Be("OUTPATIENT CLINIC CENSUS - EXECUTIVE SUMMARY & STATISTICS");

        // Section 1 Telemetry
        ws2.Cell(5, 1).GetString().Should().Contain("1. OPERATIONAL CENSUS TELEMETRY");
        ws2.Cell(7, 1).GetString().Should().Be("Total Outpatient Census");
        ws2.Cell(7, 2).GetString().Should().Be("1");

        // Section 2 Demographics
        var ws2Text = string.Join("\n", Enumerable.Range(1, 60).Select(r => ws2.Cell(r, 1).GetString()));
        ws2Text.Should().Contain("2. PATIENT DEMOGRAPHICS & SPECIAL CATEGORIES");
        ws2Text.Should().Contain("3. CLINICAL ACUITY & TRIAGE DISTRIBUTION");
        ws2Text.Should().Contain("4. CLINICIAN & NURSING STAFF WORKLOAD SUMMARY");
    }

    [Fact]
    public void ClinicCensusExcelService_EmptyReport_ShouldGenerateValidSpreadsheet()
    {
        // Arrange
        var emptyReport = new ClinicCensusReportDto(
            StartDate: DateTime.UtcNow.Date,
            EndDate: DateTime.UtcNow.Date,
            TenantId: _testTenantId,
            ClinicId: _testClinicId,
            ClinicName: "Empty Health Center",
            GeneratedAt: DateTime.UtcNow,
            Summary: new CensusSummaryDto(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.0, 0),
            Demographics: new CensusDemographicsBreakdownDto(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            Acuity: new CensusAcuityBreakdownDto(0, 0, 0, 0, 0, 0),
            VisitTypes: new List<CensusVisitTypeBreakdownDto>(),
            Providers: new List<CensusProviderBreakdownDto>(),
            Items: new List<CensusItemDto>()
        );

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Empty Health Center"
        };

        // Act
        var bytes = _excelService.GenerateClinicCensusExcel(emptyReport, settings);

        // Assert
        bytes.Should().NotBeNull();
        bytes.Length.Should().BeGreaterThan(500);

        using var ms = new MemoryStream(bytes);
        using var workbook = new XLWorkbook(ms);
        workbook.Worksheets.Count.Should().Be(2);

        var ws2 = workbook.Worksheet("Executive Summary & Statistics");
        var ws2Text = string.Join("\n", Enumerable.Range(1, 60).Select(r => ws2.Cell(r, 1).GetString()));
        ws2Text.Should().Contain("No provider encounters recorded in this reporting period.");
    }

    // =========================================================================
    // PART 3: QUESTPDF VECTOR DOCUMENT GENERATION TESTS
    // =========================================================================

    [Fact]
    public void ClinicDocumentPdfService_ShouldGenerateLandscapeVectorPdf_WithLetterheadAndSignatures()
    {
        // Arrange
        var report = CreateSampleCensusReport();
        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Provincial General Outpatient Clinic",
            AccreditationNumber = "PHIC-DOH-2026-443",
            LetterheadAddress = "Capitol Grounds, Batangas City",
            LetterheadContact = "+63 43 723 1111"
        };

        // Act
        var pdfBytes = _pdfService.GenerateClinicCensusReportPdf(report, settings, "Maria Santos, RN");

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);

        // Validate %PDF- vector header
        var header = Encoding.ASCII.GetString(pdfBytes, 0, Math.Min(pdfBytes.Length, 8));
        header.Should().StartWith("%PDF-");
    }

    [Fact]
    public void ClinicDocumentPdfService_EmptyReport_ShouldGenerateValidPdf()
    {
        // Arrange
        var emptyReport = new ClinicCensusReportDto(
            StartDate: DateTime.UtcNow.Date,
            EndDate: DateTime.UtcNow.Date,
            TenantId: _testTenantId,
            ClinicId: _testClinicId,
            ClinicName: "Empty Clinic",
            GeneratedAt: DateTime.UtcNow,
            Summary: new CensusSummaryDto(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.0, 0),
            Demographics: new CensusDemographicsBreakdownDto(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            Acuity: new CensusAcuityBreakdownDto(0, 0, 0, 0, 0, 0),
            VisitTypes: new List<CensusVisitTypeBreakdownDto>(),
            Providers: new List<CensusProviderBreakdownDto>(),
            Items: new List<CensusItemDto>()
        );

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Empty Clinic"
        };

        // Act
        var pdfBytes = _pdfService.GenerateClinicCensusReportPdf(emptyReport, settings);

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(500);
        Encoding.ASCII.GetString(pdfBytes, 0, 5).Should().Be("%PDF-");
    }

    [Fact]
    public void ClinicDocumentPdfService_MultiPageReport_RendersAcrossPageBreaks()
    {
        // Arrange - generate 35 rows to guarantee multi-page rendering
        var items = new List<CensusItemDto>();
        for (int i = 1; i <= 35; i++)
        {
            items.Add(new CensusItemDto(
                SequenceNumber: i,
                CheckInTime: DateTime.UtcNow.AddMinutes(-i * 10),
                TriageTime: DateTime.UtcNow.AddMinutes(-i * 10 + 5),
                CalledTime: DateTime.UtcNow.AddMinutes(-i * 10 + 10),
                CompletedTime: DateTime.UtcNow.AddMinutes(-i * 10 + 35),
                TurnaroundMinutes: 35,
                QueueNumber: $"Q-{i:000}",
                PatientCode: $"PAT-{i:000}",
                PatientName: $"Patient MultiPage #{i}",
                Age: 20 + (i % 50),
                Sex: i % 2 == 0 ? "Female" : "Male",
                CivilStatus: "Single",
                Classification: i % 3 == 0 ? "Senior, PhilHealth" : "Regular",
                CustomFields: new Dictionary<string, object?> { ["student_id"] = $"STU-{i}" },
                CustomFieldsSummary: $"student id: STU-{i}",
                VisitType: i % 4 == 0 ? "StandaloneProcedure" : "Consultation",
                ChiefComplaint: $"Recurrent symptoms pattern #{i}",
                NurseAssessment: $"Nursing triage impression note #{i}",
                AttendingNurse: "Nurse Supervisor Teresa",
                VitalsSnapshot: "BP 120/80, HR 75bpm, RR 18cpm, T 36.5°C",
                AttendingDoctor: "Dr. Gabriel Silang (PRC: 998877)",
                DoctorDiagnosis: $"[J06.{i % 9}] Acute infection #{i} (Primary)",
                ClinicalAssessment: "Stable under symptomatic therapy",
                SystemsReviewed: "Cardiorespiratory: Normal; Musculoskeletal: Normal",
                ProceduresPerformed: i % 4 == 0 ? "Minor dressing" : "None",
                Acuity: i % 5 == 0 ? "Urgent" : "Routine",
                Disposition: "Treated & Discharged",
                BillingStatus: "Paid",
                OfficialReceiptNumber: $"OR-9988-{i}",
                AmountPaid: 450m,
                GrossAmount: 450m,
                NetAmount: 450m,
                BalanceDue: 0m,
                IsNewPatient: i % 2 == 1
            ));
        }

        var report = new ClinicCensusReportDto(
            StartDate: DateTime.UtcNow.Date.AddDays(-7),
            EndDate: DateTime.UtcNow.Date,
            TenantId: _testTenantId,
            ClinicId: _testClinicId,
            ClinicName: "Regional Medical Center",
            GeneratedAt: DateTime.UtcNow,
            Summary: new CensusSummaryDto(35, 18, 17, 26, 9, 0, 9, 35, 0, 0, 0, 35.0, 35),
            Demographics: new CensusDemographicsBreakdownDto(5, 14.3, 20, 57.1, 10, 28.6, 17, 48.6, 18, 51.4, 0, 0, 10, 2, 10),
            Acuity: new CensusAcuityBreakdownDto(28, 80.0, 7, 20.0, 0, 0),
            VisitTypes: new List<CensusVisitTypeBreakdownDto>
            {
                new("Consultation", 26, 74.3),
                new("StandaloneProcedure", 9, 25.7)
            },
            Providers: new List<CensusProviderBreakdownDto>
            {
                new("Dr. Gabriel Silang", "Doctor", 26, 26),
                new("Nurse Supervisor Teresa", "Nurse", 35, 35)
            },
            Items: items
        );

        var settings = new FacilitySettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Regional Medical Center",
            AccreditationNumber = "PHIC-REG-101",
            LetterheadAddress = "Iloilo City, Philippines"
        };

        // Act
        var pdfBytes = _pdfService.GenerateClinicCensusReportPdf(report, settings, "Nurse Supervisor Teresa");

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(5000);
        Encoding.ASCII.GetString(pdfBytes, 0, 5).Should().Be("%PDF-");
    }

    // =========================================================================
    // PART 4: REPORTS CONTROLLER ENDPOINT TESTS
    // =========================================================================

    [Fact]
    public async Task ReportsController_GetClinicCensusReport_Returns200WithApiResponse()
    {
        // Arrange
        var sender = Substitute.For<ISender>();
        var sampleReport = CreateSampleCensusReport();
        sender.Send(Arg.Any<GetClinicCensusReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(sampleReport);

        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var controller = new ReportsController(
            sender, _pdfService, settingsRepo, null, _clinicContext, _excelService);

        var startDate = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);
        var endDate = new DateTime(2026, 11, 5, 0, 0, 0, DateTimeKind.Utc);

        // Act
        var actionResult = await controller.GetClinicCensusReport(
            startDate, endDate, null, null, null, null, CancellationToken.None);

        // Assert
        var okResult = actionResult.Result as OkObjectResult;
        okResult.Should().NotBeNull();
        okResult!.StatusCode.Should().Be(200);

        var apiResponse = okResult.Value as ApiResponse<ClinicCensusReportDto>;
        apiResponse.Should().NotBeNull();
        apiResponse!.Succeeded.Should().BeTrue();
        apiResponse.Data.Should().NotBeNull();
        apiResponse.Data!.ClinicName.Should().Be(sampleReport.ClinicName);
        apiResponse.Data.Summary.TotalCensus.Should().Be(sampleReport.Summary.TotalCensus);
    }

    [Fact]
    public async Task ReportsController_GetClinicCensusReportPdf_ReturnsPdfFileResult()
    {
        // Arrange
        var sender = Substitute.For<ISender>();
        var sampleReport = CreateSampleCensusReport();
        sender.Send(Arg.Any<GetClinicCensusReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(sampleReport);

        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var controller = new ReportsController(
            sender, _pdfService, settingsRepo, null, _clinicContext, _excelService);

        var startDate = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);
        var endDate = new DateTime(2026, 11, 5, 0, 0, 0, DateTimeKind.Utc);

        // Act
        var result = await controller.GetClinicCensusReportPdf(
            startDate, endDate, null, null, null, null, CancellationToken.None);

        // Assert
        var fileResult = result as FileContentResult;
        fileResult.Should().NotBeNull();
        fileResult!.ContentType.Should().Be("application/pdf");
        fileResult.FileDownloadName.Should().Be($"ClinicCensusReport-{startDate:yyyyMMdd}-{endDate:yyyyMMdd}.pdf");
        fileResult.FileContents.Should().NotBeEmpty();
        Encoding.ASCII.GetString(fileResult.FileContents, 0, 5).Should().Be("%PDF-");
    }

    [Fact]
    public async Task ReportsController_GetClinicCensusReportExcel_ReturnsExcelFileResult()
    {
        // Arrange
        var sender = Substitute.For<ISender>();
        var sampleReport = CreateSampleCensusReport();
        sender.Send(Arg.Any<GetClinicCensusReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(sampleReport);

        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var controller = new ReportsController(
            sender, _pdfService, settingsRepo, null, _clinicContext, _excelService);

        var startDate = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);
        var endDate = new DateTime(2026, 11, 5, 0, 0, 0, DateTimeKind.Utc);

        // Act
        var result = await controller.GetClinicCensusReportExcel(
            startDate, endDate, null, null, null, null, CancellationToken.None);

        // Assert
        var fileResult = result as FileContentResult;
        fileResult.Should().NotBeNull();
        fileResult!.ContentType.Should().Be("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        fileResult.FileDownloadName.Should().Be($"ClinicCensusReport-{startDate:yyyyMMdd}-{endDate:yyyyMMdd}.xlsx");
        fileResult.FileContents.Should().NotBeEmpty();

        using var ms = new MemoryStream(fileResult.FileContents);
        using var workbook = new XLWorkbook(ms);
        workbook.Worksheets.Count.Should().Be(2);
    }

    [Fact]
    public async Task ReportsController_BackwardCompatibleConstructor_WorksWithDefaultExcelService()
    {
        // Arrange - test 3-parameter constructor
        var sender = Substitute.For<ISender>();
        var sampleReport = CreateSampleCensusReport();
        sender.Send(Arg.Any<GetClinicCensusReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(sampleReport);

        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        // Using original 3-arg constructor
        var controller = new ReportsController(sender, _pdfService, settingsRepo);

        var startDate = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);
        var endDate = new DateTime(2026, 11, 5, 0, 0, 0, DateTimeKind.Utc);

        // Act
        var result = await controller.GetClinicCensusReportExcel(
            startDate, endDate, null, null, null, null, CancellationToken.None);

        // Assert
        var fileResult = result as FileContentResult;
        fileResult.Should().NotBeNull();
        fileResult!.ContentType.Should().Be("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        fileResult.FileContents.Should().NotBeEmpty();

        using var ms = new MemoryStream(fileResult.FileContents);
        using var workbook = new XLWorkbook(ms);
        workbook.Worksheets.Should().Contain(ws => ws.Name == "Census Register");
    }

    // =========================================================================
    // HELPER: CREATE SAMPLE CENSUS REPORT DTO
    // =========================================================================

    private ClinicCensusReportDto CreateSampleCensusReport()
    {
        var start = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2026, 11, 5, 0, 0, 0, DateTimeKind.Utc);

        var item = new CensusItemDto(
            SequenceNumber: 1,
            CheckInTime: start.AddHours(8),
            TriageTime: start.AddHours(8).AddMinutes(10),
            CalledTime: start.AddHours(8).AddMinutes(20),
            CompletedTime: start.AddHours(8).AddMinutes(45),
            TurnaroundMinutes: 45,
            QueueNumber: "Q-001",
            PatientCode: "PAT-001",
            PatientName: "Dela Cruz, Juan",
            Age: 35,
            Sex: "Male",
            CivilStatus: "Married",
            Classification: "PhilHealth",
            CustomFields: new Dictionary<string, object?> { ["Department"] = "Engineering" },
            CustomFieldsSummary: "Department: Engineering",
            VisitType: "Consultation",
            ChiefComplaint: "Chronic Lower Back Pain",
            NurseAssessment: "Alert, ambulating with slight antalgic gait",
            AttendingNurse: "Nurse Maria Santos",
            VitalsSnapshot: "BP 120/80, HR 72bpm, RR 18cpm, T 36.5°C, SpO2 99%, BMI 23.4",
            AttendingDoctor: "Dr. Jose Rizal (PRC: 0012345)",
            DoctorDiagnosis: "[I10] Hypertension (Primary)",
            ClinicalAssessment: "Musculoskeletal Lumbosacral Strain",
            SystemsReviewed: "Cardiorespiratory: Normal; Musculoskeletal: Lumbar tenderness",
            ProceduresPerformed: "None",
            Acuity: "Routine",
            Disposition: "Treated & Discharged",
            BillingStatus: "Paid",
            OfficialReceiptNumber: "OR-001",
            AmountPaid: 500m,
            GrossAmount: 500m,
            NetAmount: 500m,
            BalanceDue: 0m,
            IsNewPatient: true
        );

        return new ClinicCensusReportDto(
            StartDate: start,
            EndDate: end,
            TenantId: _testTenantId,
            ClinicId: _testClinicId,
            ClinicName: "St. Luke's Outpatient Care",
            GeneratedAt: DateTime.UtcNow,
            Summary: new CensusSummaryDto(
                TotalCensus: 1,
                NewPatients: 1,
                ReturningPatients: 0,
                Consultations: 1,
                StandaloneProcedures: 0,
                DiagnosticsOrLab: 0,
                NonDoctorVisits: 0,
                CompletedVisits: 1,
                InConsultationOrWaiting: 0,
                DivertedVisits: 0,
                CancelledOrNoShow: 0,
                AverageTurnaroundMinutes: 45.0,
                DistinctPatientsCount: 1,
                UrgentAcuityCount: 0,
                EmergencyAcuityCount: 0
            ),
            Demographics: new CensusDemographicsBreakdownDto(
                PediatricCount: 0,
                PediatricPercentage: 0,
                AdultCount: 1,
                AdultPercentage: 100,
                SeniorCount: 0,
                SeniorPercentage: 0,
                MaleCount: 1,
                MalePercentage: 100,
                FemaleCount: 0,
                FemalePercentage: 0,
                OtherGenderCount: 0,
                OtherGenderPercentage: 0,
                SeniorCitizenCount: 0,
                PwdCount: 0,
                PhilHealthCount: 1
            ),
            Acuity: new CensusAcuityBreakdownDto(
                RoutineCount: 1,
                RoutinePercentage: 100,
                UrgentCount: 0,
                UrgentPercentage: 0,
                EmergencyCount: 0,
                EmergencyPercentage: 0
            ),
            VisitTypes: new List<CensusVisitTypeBreakdownDto>
            {
                new("Consultation", 1, 100.0)
            },
            Providers: new List<CensusProviderBreakdownDto>
            {
                new("Dr. Jose Rizal", "Doctor", 1, 1),
                new("Nurse Maria Santos", "Nurse", 1, 1)
            },
            Items: new List<CensusItemDto> { item }
        );
    }
}
