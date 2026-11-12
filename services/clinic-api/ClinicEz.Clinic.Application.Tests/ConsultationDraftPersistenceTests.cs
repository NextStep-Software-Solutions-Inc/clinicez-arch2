using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Consultations.Queries;
using ClinicEz.Clinic.Application.Features.Documents.Commands;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Documents.Security;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ConsultationDraftPersistenceTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string TenantId = "tenant-draft-persistence";
    private readonly Guid _doctorId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;

    public ConsultationDraftPersistenceTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(TenantId);
        _clinicContext.StaffId.Returns(_doctorId);
        _clinicContext.StaffName.Returns("Dr. Elena Cruz");
    }

    private static string FormatPatientName(Patient p) => $"{p.LastName}, {p.FirstName}";

    [Fact]
    public async Task YakapFullDraftPersistence_AcrossFreshDbContextReload_RoundTripsEveryFieldCohortAndOrder()
    {
        var sharedDbName = $"ClinicEz_DraftReload_{Guid.NewGuid()}";
        var (db1, uow1, sieve1) = TestDbHelper.CreateSharedTestContext(sharedDbName, _clinicContext);

        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var patientName = FormatPatientName(patient);
        db1.Patients.Add(patient);

        var doctor = new StaffMember
        {
            Id = _doctorId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Elena",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-777001",
            PtrNumber = "PTR-888001",
            S2LicenseNumber = "S2-999001",
            PhilHealthPan = "PAN-111001",
            IsActive = true
        };
        db1.StaffMembers.Add(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientName,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Triaged,
            CheckInTime = DateTime.UtcNow
        };
        db1.QueueItems.Add(queueItem);
        await uow1.SaveChangesAsync();

        var createHandler = new CreateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db1, sieve1),
            TestDbHelper.CreateRepository<QueueItem>(db1, sieve1),
            uow1,
            _clinicContext,
            TestDbHelper.CreateRepository<StaffMember>(db1, sieve1),
            TestDbHelper.CreateRepository<FacilitySettings>(db1, sieve1));

        var initialDraft = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            DoctorId: doctor.Id,
            DoctorName: "Dr. Elena Cruz",
            QueueItemId: queueItem.Id,
            Subjective: "Initial draft subjective",
            VisitWorkflowMode: "YakapAvailment",
            IsYakapEligible: true,
            PhilHealthAtc: "WALKEDIN"), CancellationToken.None);

        initialDraft.IsSigned.Should().BeFalse();

        var updateHandler = new UpdateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db1, sieve1),
            TestDbHelper.CreateRepository<EncounterDiagnosis>(db1, sieve1),
            TestDbHelper.CreateRepository<PrescriptionItem>(db1, sieve1),
            uow1,
            _clinicContext,
            TestDbHelper.CreateRepository<StaffMember>(db1, sieve1),
            TestDbHelper.CreateRepository<FacilitySettings>(db1, sieve1),
            null,
            TestDbHelper.CreateRepository<EncounterReviewOfSystemsItem>(db1, sieve1));

        var updatedDraft = await updateHandler.Handle(new UpdateConsultationCommand(
            Id: initialDraft.Id,
            Subjective: "Epigastric pain and mild headache for 2 days",
            Objective: "BP 142/90, tender epigastrium",
            Assessment: "Essential hypertension; Dyspepsia",
            Plan: "Start Amlodipine 5mg OD and lifestyle modification",
            HomeInstructions: "Monitor home BP twice daily and avoid NSAIDs",
            RosCategory: "Gastrointestinal",
            VisitWorkflowMode: "YakapAvailment",
            IsYakapEligible: true,
            PhilHealthAtc: "ATC987654",
            DoctorPrcLicense: "PRC-OVERRIDE-01",
            DoctorPtr: "PTR-OVERRIDE-01",
            DoctorS2License: "S2-OVERRIDE-01",
            DoctorPhilHealthPan: "PAN-OVERRIDE-01",
            PhilHealthSignSympCode: "PAIN,X",
            PhilHealthPainSite: "Epigastric region",
            PhilHealthOtherComplaint: "Intermittent dizziness",
            ReviewOfSystemsItems: new List<ConsultationRosItemInput>
            {
                new(OptionCode: "PAIN", SymptomName: "Abdominal Pain", IsPertinentPositive: true, PainSite: "Epigastric region"),
                new(OptionCode: "X", SymptomName: "Others", IsPertinentPositive: true, OthersSpecifyText: "Intermittent dizziness")
            },
            PhysicalExams: new List<ConsultationPhysicalExamDto>
            {
                new(
                    GeneralSurveyId: "2",
                    GeneralSurveyRemarks: "Mild distress due to epigastric pain",
                    Findings: new List<ConsultationPhysicalExamFindingDto>
                    {
                        new(System: "Abdomen", IsNormal: false, FindingTitle: "Tenderness", OptionCode: "ABD02", PhilHealthFindingCode: "ABD02", Remarks: "Epigastric tenderness"),
                        new(System: "Heart", IsNormal: true, FindingTitle: "Essentially Normal")
                    })
            },
            ObGyneExam: new ConsultationObGyneExamDto(
                Gravidity: 2,
                Parity: 1,
                TermBirths: 1,
                PretermBirths: 0,
                Abortions: 0,
                LivingChildren: 1,
                Lmp: "2026-10-01",
                Edd: "2027-07-08",
                GestationalAgeWeeks: 6,
                FundicHeightCm: 12.5m,
                FetalHeartToneBpm: 145,
                FetalPresentation: "Cephalic",
                Remarks: "Early prenatal follow-up"),
            PediatricMilestones: new List<ConsultationPediatricMilestoneDto>
            {
                new(
                    MilestoneVisitAge: "12m",
                    GrossMotorStatus: "Appropriate",
                    FineMotorStatus: "Appropriate",
                    LanguageStatus: "Delayed",
                    CognitiveStatus: "Appropriate",
                    SocialEmotionalStatus: "Appropriate",
                    DangerSigns: new List<string> { "Lethargy" },
                    Remarks: "Speech evaluation advised")
            },
            AdolescentAssessment: new ConsultationAdolescentAssessmentDto(
                TannerStage: 3,
                SmrBreastRating: "SMR3",
                SmrPubicHairRating: "SMR3",
                MenarcheAgeYears: 12,
                IsSexuallyActive: false,
                SubstanceUseNoted: false,
                DepressionScreenPositive: true,
                Remarks: "Counseling provided"),
            HeadsssAssessments: new List<ConsultationHeadsssAssessmentDto>
            {
                new(Domain: "Home", AssessmentText: "Supportive household", HasRedFlags: false),
                new(Domain: "DepressionSuicide", AssessmentText: "Academic stress noted", HasRedFlags: true, RedFlags: new List<string> { "Sleep disturbance" })
            },
            BpMonitoringLogs: new List<ConsultationBpMonitoringLogDto>
            {
                new(RecordedAt: "2026-11-10T08:00:00Z", Systolic: 142, Diastolic: 90, PulseBpm: 78, Location: "Clinic", Arm: "Left", Remarks: "Seated rest 5m")
            },
            CounselingCodes: "DIET,EXER",
            RoutineVaccineName: "Influenza",
            RoutineVaccineDate: "2026-11-11",
            AdultsRoutineScreeningCode: "FBS,LIPID",
            CancerScreeningCodes: "VIA",
            DiagnosticServicesOption: "Y",
            HasMedicationPrescription: true,
            HasReferral: false,
            OtherMedicalAdviceSpec: "Low-sodium DASH diet",
            HasFollowUp: true,
            FollowUpDate: "2026-11-25",
            FollowUpScheduleText: "2 weeks",
            FollowUpReason: "BP recheck and lab review",
            Diagnoses: new List<DiagnosisInput>
            {
                new("I10", "Essential (primary) hypertension", true),
                new("K30", "Functional dyspepsia", false)
            },
            Prescriptions: new List<PrescriptionInput>
            {
                new("Amlodipine", null, "5mg", "Tablet", "1 tab OD", 30, 30, 0, false, null, "AMLO00000000000000000000000001", ClinicDispensedQuantity: 5, RosCategory: "Cardiovascular")
            },
            DraftDiagnosticOrders: new List<DraftDiagnosticOrderDto>
            {
                new("svc-cbc", "CBC", "Complete Blood Count", "Diagnostic", 250m, "PH-CBC", "in_house", "Baseline check"),
                new("svc-lipid", "LIPID", "Lipid Profile", "Diagnostic", 650m, "PH-LIPID", "outside", "10-12 hours fasting")
            },
            DraftProcedures: new List<DraftProcedureOrderDto>
            {
                new("svc-ecg", "ECG12", "12-Lead ECG", "Procedure", 450m, "Supine resting", "room-tx-1", "Treatment Room 1", "room-tx-1", "Treatment Room 1", "draft", null, null, false, null)
            },
            DraftDentalTeeth: new List<DraftDentalToothDto>
            {
                new(16, "Caries", "O", "Occlusal pit caries")
            },
            DraftWorkspace: new ConsultationDraftWorkspaceDto(
                CdsOverrideReason: "Benefit outweighs mild interaction risk",
                CdsOverrideConfirmed: true,
                PlanDiagnosticServicesOption: "Y",
                PlanHasMedicationPrescription: true,
                PlanHasReferral: false,
                PlanHasCancerScreening: true,
                PlanHasFollowUp: true,
                MedCertFitness: "NeedsRest",
                MedCertRestDays: "2",
                MedCertPurpose: "Work excuse",
                MedCertRemarks: "Avoid strenuous activity",
                RefFacility: "PGH",
                RefDepartment: "Cardiology",
                RefUrgency: "Routine",
                RefReason: "Resistant hypertension workup",
                RefSummary: "BP >140/90 on 2 visits")), CancellationToken.None);

        updatedDraft.UpdatedAt.Should().NotBeNull();

        // Reload via a completely separate DbContext instance (simulating full page refresh / switching patients)
        var (db2, _, sieve2) = TestDbHelper.CreateSharedTestContext(sharedDbName, _clinicContext);

        var byIdHandler = new GetConsultationByIdQueryHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db2, sieve2),
            _clinicContext);
        var reloadedById = await byIdHandler.Handle(new GetConsultationByIdQuery(initialDraft.Id), CancellationToken.None);

        var chartHandler = new GetPatientChartQueryHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db2, sieve2),
            TestDbHelper.CreateRepository<PatientVitals>(db2, sieve2),
            TestDbHelper.CreateRepository<Procedure>(db2, sieve2),
            TestDbHelper.CreateRepository<LabOrder>(db2, sieve2),
            TestDbHelper.CreateRepository<Invoice>(db2, sieve2),
            _clinicContext,
            patientRepo: TestDbHelper.CreateRepository<Patient>(db2, sieve2),
            medCertRepo: TestDbHelper.CreateRepository<MedicalCertificate>(db2, sieve2),
            referralRepo: TestDbHelper.CreateRepository<ReferralLetter>(db2, sieve2),
            queueRepo: TestDbHelper.CreateRepository<QueueItem>(db2, sieve2));

        var chart = await chartHandler.Handle(new GetPatientChartQuery(patient.Id), CancellationToken.None);
        var chartConsult = chart.Consultations.Should().ContainSingle(c => c.Id == initialDraft.Id).Subject;

        foreach (var dto in new[] { reloadedById, chartConsult })
        {
            dto.IsSigned.Should().BeFalse();
            dto.VisitWorkflowMode.Should().Be("YakapAvailment");
            dto.IsYakapEligible.Should().BeTrue();
            dto.PhilHealthAtc.Should().Be("ATC987654");
            dto.DoctorPrcLicense.Should().Be("PRC-OVERRIDE-01");
            dto.DoctorPtr.Should().Be("PTR-OVERRIDE-01");
            dto.DoctorS2License.Should().Be("S2-OVERRIDE-01");
            dto.DoctorPhilHealthPan.Should().Be("PAN-OVERRIDE-01");
            dto.Subjective.Should().Be("Epigastric pain and mild headache for 2 days");
            dto.Objective.Should().Be("BP 142/90, tender epigastrium");
            dto.Assessment.Should().Be("Essential hypertension; Dyspepsia");
            dto.Plan.Should().Be("Start Amlodipine 5mg OD and lifestyle modification");
            dto.HomeInstructions.Should().Be("Monitor home BP twice daily and avoid NSAIDs");
            dto.RosCategory.Should().Be("Gastrointestinal");
            dto.CreatedAt.Should().NotBeNull();
            dto.UpdatedAt.Should().NotBeNull();

            // Lossless ROS items without "Site:" duplication
            dto.ReviewOfSystemsItems.Should().HaveCount(2);
            dto.ReviewOfSystemsItems!.Should().Contain(r =>
                r.OptionCode == "PAIN" &&
                r.IsPertinentPositive == true &&
                r.PainSite == "Epigastric region");
            dto.ReviewOfSystemsItems.Should().Contain(r =>
                r.OptionCode == "X" &&
                r.IsPertinentPositive == true &&
                r.OthersSpecifyText == "Intermittent dizziness");

            // 1NF Physical Exam
            dto.PhysicalExams.Should().ContainSingle();
            dto.PhysicalExams![0].GeneralSurveyId.Should().Be("2");
            dto.PhysicalExams[0].GeneralSurveyRemarks.Should().Be("Mild distress due to epigastric pain");
            dto.PhysicalExams[0].Findings.Should().Contain(f =>
                f.System == "Abdomen" && !f.IsNormal && f.OptionCode == "ABD02" && f.Remarks == "Epigastric tenderness");

            // 1NF YAKAP Cohorts
            dto.ObGyneExam.Should().NotBeNull();
            dto.ObGyneExam!.Gravidity.Should().Be(2);
            dto.ObGyneExam.Lmp.Should().Be("2026-10-01");
            dto.ObGyneExam.FetalHeartToneBpm.Should().Be(145);

            dto.PediatricMilestones.Should().ContainSingle();
            dto.PediatricMilestones![0].MilestoneVisitAge.Should().Be("12m");
            dto.PediatricMilestones[0].LanguageStatus.Should().Be("Delayed");
            dto.PediatricMilestones[0].DangerSigns.Should().ContainSingle().Which.Should().Be("Lethargy");

            dto.AdolescentAssessment.Should().NotBeNull();
            dto.AdolescentAssessment!.TannerStage.Should().Be(3);
            dto.AdolescentAssessment.DepressionScreenPositive.Should().BeTrue();

            dto.HeadsssAssessments.Should().HaveCount(2);
            dto.HeadsssAssessments!.Should().Contain(h =>
                h.Domain == "Suicide" && h.HasRedFlags == true);

            dto.BpMonitoringLogs.Should().ContainSingle();
            dto.BpMonitoringLogs![0].Systolic.Should().Be(142);
            dto.BpMonitoringLogs[0].Diastolic.Should().Be(90);

            // Plan Management & Orders
            dto.CounselingCodes.Should().Be("DIET,EXER");
            dto.DiagnosticServicesOption.Should().Be("Y");
            dto.HasMedicationPrescription.Should().BeTrue();
            dto.HasReferral.Should().BeFalse();
            dto.HasFollowUp.Should().BeTrue();
            dto.Diagnoses.Should().HaveCount(2);
            dto.Prescriptions.Should().ContainSingle(p => p.GenericName == "Amlodipine" && p.ClinicDispensedQuantity == 5);

            // Persisted Draft Orders & Workspace
            dto.DraftDiagnosticOrders.Should().HaveCount(2);
            dto.DraftDiagnosticOrders!.Should().Contain(d => d.Code == "CBC" && d.FulfillmentMode == "in_house");
            dto.DraftDiagnosticOrders.Should().Contain(d => d.Code == "LIPID" && d.FulfillmentMode == "outside" && d.Instructions == "10-12 hours fasting");
            dto.DraftProcedures.Should().ContainSingle(p => p.Code == "ECG12" && p.TargetRoomName == "Treatment Room 1");
            dto.DraftDentalTeeth.Should().ContainSingle(t => t.ToothNumber == 16 && t.Status == "Caries" && t.Surface == "O");
            dto.DraftWorkspace.Should().NotBeNull();
            dto.DraftWorkspace!.CdsOverrideReason.Should().Be("Benefit outweighs mild interaction risk");
            dto.DraftWorkspace.MedCertRestDays.Should().Be("2");
            dto.DraftWorkspace.RefFacility.Should().Be("PGH");
        }
    }

    [Fact]
    public async Task RegularDraftPersistence_ClearingFieldsAndRepeatedAutoSaves_LeavesZeroDuplicateChildRows()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var patientName = FormatPatientName(patient);
        db.Patients.Add(patient);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientName,
            QueueNumber = "Q-REG-01",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.Consultation,
            Status = QueueStatus.InConsultation,
            CheckInTime = DateTime.UtcNow
        };
        db.QueueItems.Add(queueItem);
        await uow.SaveChangesAsync();

        var createHandler = new CreateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve),
            uow,
            _clinicContext);

        var draft = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            DoctorId: _doctorId,
            DoctorName: "Dr. Elena Cruz",
            QueueItemId: queueItem.Id,
            Subjective: "Cough and fever",
            HomeInstructions: "Drink plenty of fluids",
            RosCategory: "Respiratory",
            VisitWorkflowMode: "Regular",
            IsYakapEligible: false,
            Diagnoses: new List<DiagnosisInput> { new("J06.9", "Acute upper respiratory infection", true) },
            Prescriptions: new List<PrescriptionInput> { new("Paracetamol", null, "500mg", "Tablet", "1 tab q6h PRN", 10) },
            PhysicalExams: new List<ConsultationPhysicalExamDto>
            {
                new(GeneralSurveyId: "1", Findings: new List<ConsultationPhysicalExamFindingDto>
                {
                    new(System: "ChestLungs", IsNormal: false, FindingTitle: "Crackles", OptionCode: "CL01", Remarks: "Bibasal")
                })
            },
            DraftDiagnosticOrders: new List<DraftDiagnosticOrderDto>
            {
                new("svc-cxr", "CXR", "Chest X-Ray PA", "Imaging", 500m, null, "outside", "Upright PA")
            }), CancellationToken.None);

        db.LabOrders.Count(lo => lo.ConsultationId == draft.Id && !lo.IsSigned).Should().Be(1);

        var updateHandler = new UpdateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<EncounterDiagnosis>(db, sieve),
            TestDbHelper.CreateRepository<PrescriptionItem>(db, sieve),
            uow,
            _clinicContext,
            rosRepository: TestDbHelper.CreateRepository<EncounterReviewOfSystemsItem>(db, sieve));

        // Physician clears Subjective, HomeInstructions, RosCategory, and removes all diagnoses, prescriptions, and outside lab orders
        var cleared = await updateHandler.Handle(new UpdateConsultationCommand(
            Id: draft.Id,
            Subjective: "",
            Objective: "Afebrile, clear breath sounds",
            Assessment: "Resolved viral URI",
            Plan: "Reassurance",
            HomeInstructions: "",
            RosCategory: "",
            VisitWorkflowMode: "Regular",
            IsYakapEligible: false,
            Diagnoses: new List<DiagnosisInput>(),
            Prescriptions: new List<PrescriptionInput>(),
            PhysicalExams: new List<ConsultationPhysicalExamDto>
            {
                new(GeneralSurveyId: "1", GeneralSurveyRemarks: "", Findings: new List<ConsultationPhysicalExamFindingDto>())
            },
            DraftDiagnosticOrders: new List<DraftDiagnosticOrderDto>()), CancellationToken.None);

        cleared.Subjective.Should().BeEmpty();
        cleared.HomeInstructions.Should().BeNull();
        cleared.RosCategory.Should().BeNull();
        cleared.Diagnoses.Should().BeEmpty();
        cleared.Prescriptions.Should().BeEmpty();
        cleared.DraftDiagnosticOrders.Should().BeNullOrEmpty();

        db.Set<EncounterDiagnosis>().Count(d => d.ConsultationEncounterId == draft.Id).Should().Be(0);
        db.Set<PrescriptionItem>().Count(p => p.ConsultationEncounterId == draft.Id).Should().Be(0);
        db.Set<PatientPhysicalExam>().Count(pe => pe.ConsultationEncounterId == draft.Id).Should().Be(1);
        db.LabOrders.Count(lo => lo.ConsultationId == draft.Id).Should().Be(0);
    }

    [Fact]
    public async Task RelationalDraftAssociation_LinksPreExistingVisitArtifacts_SyncsOutsideLabOrders_AndUpdatesMedCertAndReferralInPlace()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var patientName = FormatPatientName(patient);
        db.Patients.Add(patient);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientName,
            QueueNumber = "Q-REL-01",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.Consultation,
            Status = QueueStatus.Triaged,
            CheckInTime = DateTime.UtcNow
        };
        db.QueueItems.Add(queueItem);

        // Pre-existing triage vitals and handed-off procedure created on the visit before consultation draft row existed
        var vitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            QueueItemId = queueItem.Id,
            SystolicBp = 120,
            DiastolicBp = 80,
            RecordedAt = DateTime.UtcNow
        };
        db.PatientVitals.Add(vitals);

        var procedure = new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientName,
            QueueItemId = queueItem.Id,
            ProcedureName = "Nebulization",
            Category = "Procedure",
            OrderedByDoctorId = _doctorId,
            OrderedByDoctorName = "Dr. Elena Cruz",
            Status = ProcedureStatus.Ordered,
            ScheduledAt = DateTime.UtcNow
        };
        db.Procedures.Add(procedure);
        await uow.SaveChangesAsync();

        var createHandler = new CreateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve),
            uow,
            _clinicContext);

        var draft = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            DoctorId: _doctorId,
            DoctorName: "Dr. Elena Cruz",
            QueueItemId: queueItem.Id,
            Assessment: "Acute Bronchitis",
            DraftDiagnosticOrders: new List<DraftDiagnosticOrderDto>
            {
                new("svc-cbc", "CBC", "Complete Blood Count", "Laboratory", 250m, null, "outside", "STAT")
            }), CancellationToken.None);

        // Pre-existing visit artifacts are automatically associated with the draft consultation
        var linkedVitals = await db.PatientVitals.FirstAsync(v => v.Id == vitals.Id);
        linkedVitals.ConsultationEncounterId.Should().Be(draft.Id);

        var linkedProc = await db.Procedures.FirstAsync(p => p.Id == procedure.Id);
        linkedProc.ConsultationId.Should().Be(draft.Id);

        var stagedLabOrder = await db.LabOrders.Include(lo => lo.Items)
            .SingleAsync(lo => lo.ConsultationId == draft.Id);
        stagedLabOrder.IsSigned.Should().BeFalse();
        stagedLabOrder.QueueItemId.Should().Be(queueItem.Id);
        stagedLabOrder.Items.Should().ContainSingle(i => i.TestName == "Complete Blood Count" && i.Instructions == "STAT");

        // Issue unsigned Medical Certificate twice (re-editing rest days & purpose) -> updates in-place with zero duplicate rows
        var config = new ConfigurationBuilder().Build();
        var medCertHandler = new IssueMedicalCertificateCommandHandler(
            TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve),
            uow,
            _clinicContext,
            Substitute.For<IClinicIdentityProvider>(),
            Substitute.For<IPatientDocumentPublisher>(),
            new DocumentSecurityService(),
            config,
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve));

        var cert1 = await medCertHandler.Handle(new IssueMedicalCertificateCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            ConsultationId: draft.Id,
            DoctorId: _doctorId,
            DoctorName: "Dr. Elena Cruz",
            PrcLicenseNumber: "PRC-777001",
            PtrNumber: "PTR-888001",
            Diagnosis: "Acute Bronchitis",
            ClinicalFindings: "Wheezing",
            FitnessStatus: "NeedsRest",
            RecommendedRestDays: 2,
            Purpose: "Sick leave",
            Remarks: "Initial draft remarks",
            QueueItemId: queueItem.Id), CancellationToken.None);

        var cert2 = await medCertHandler.Handle(new IssueMedicalCertificateCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            ConsultationId: draft.Id,
            DoctorId: _doctorId,
            DoctorName: "Dr. Elena Cruz",
            PrcLicenseNumber: "PRC-777001",
            PtrNumber: "PTR-888001",
            Diagnosis: "Acute Bronchitis",
            ClinicalFindings: "Clearing breath sounds",
            FitnessStatus: "NeedsRest",
            RecommendedRestDays: 4,
            Purpose: "Updated HR submission",
            Remarks: "Extended rest",
            QueueItemId: queueItem.Id), CancellationToken.None);

        cert2.Id.Should().Be(cert1.Id);
        cert2.IsSigned.Should().BeFalse();
        cert2.RecommendedRestDays.Should().Be(4);
        cert2.Purpose.Should().Be("Updated HR submission");
        db.MedicalCertificates.Count(mc => mc.ConsultationId == draft.Id).Should().Be(1);

        // Issue unsigned Referral Letter twice -> updates in-place with zero duplicate rows
        var referralHandler = new IssueReferralLetterCommandHandler(
            TestDbHelper.CreateRepository<ReferralLetter>(db, sieve),
            uow,
            _clinicContext,
            new DocumentSecurityService(),
            null,
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve));

        var ref1 = await referralHandler.Handle(new IssueReferralLetterCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            ConsultationId: draft.Id,
            ReferringDoctorId: _doctorId,
            ReferringDoctorName: "Dr. Elena Cruz",
            ReferredToDoctor: null,
            ReferredToFacility: "Lung Center",
            ReferredDepartment: "Pulmonology",
            Urgency: "Routine",
            ReasonForReferral: "Persistent wheezing",
            ProvisionalDiagnosis: "Acute Bronchitis",
            ClinicalSummary: "Initial summary",
            QueueItemId: queueItem.Id), CancellationToken.None);

        var ref2 = await referralHandler.Handle(new IssueReferralLetterCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            ConsultationId: draft.Id,
            ReferringDoctorId: _doctorId,
            ReferringDoctorName: "Dr. Elena Cruz",
            ReferredToDoctor: "Dr. Reyes",
            ReferredToFacility: "St. Luke's Medical Center",
            ReferredDepartment: "Pulmonary Medicine",
            Urgency: "Urgent",
            ReasonForReferral: "Worsening bronchospasm",
            ProvisionalDiagnosis: "Acute Bronchitis",
            ClinicalSummary: "Updated summary after nebulization",
            QueueItemId: queueItem.Id), CancellationToken.None);

        ref2.Id.Should().Be(ref1.Id);
        ref2.IsSigned.Should().BeFalse();
        ref2.ReferredToFacility.Should().Be("St. Luke's Medical Center");
        ref2.Urgency.Should().Be("Urgent");
        db.ReferralLetters.Count(r => r.ConsultationId == draft.Id).Should().Be(1);
    }

    [Theory]
    [InlineData(QueueStatus.PendingProcedure)]
    [InlineData(QueueStatus.ReEvaluation)]
    public async Task DraftAutoSave_WhenQueueItemIsPendingProcedureOrReEvaluation_PreservesQueueStatus(QueueStatus protectedStatus)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var patientName = FormatPatientName(patient);
        db.Patients.Add(patient);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientName,
            QueueNumber = "Q-PROC-01",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.Consultation,
            Status = protectedStatus,
            CheckInTime = DateTime.UtcNow
        };
        db.QueueItems.Add(queueItem);
        await uow.SaveChangesAsync();

        var createHandler = new CreateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve),
            uow,
            _clinicContext);

        var draft = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            DoctorId: _doctorId,
            DoctorName: "Dr. Elena Cruz",
            QueueItemId: queueItem.Id,
            Subjective: "Auto-saved while patient in procedure bay"), CancellationToken.None);

        var reloadedQueue = await db.QueueItems.FirstAsync(q => q.Id == queueItem.Id);
        reloadedQueue.Status.Should().Be(protectedStatus);
        draft.IsSigned.Should().BeFalse();
    }

    [Fact]
    public async Task SignConsultation_ClearsDraftEnvelope_HonorsDraftedCredentials_AndValidatesAssociatedDraftArtifacts()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var patientName = FormatPatientName(patient);
        db.Patients.Add(patient);

        var doctor = new StaffMember
        {
            Id = _doctorId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Elena",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "",
            PtrNumber = "",
            S2LicenseNumber = "",
            PhilHealthPan = "",
            IsActive = true
        };
        db.StaffMembers.Add(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientName,
            QueueNumber = "Q-SIGN-01",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.Consultation,
            Status = QueueStatus.InConsultation,
            CheckInTime = DateTime.UtcNow
        };
        db.QueueItems.Add(queueItem);
        await uow.SaveChangesAsync();

        var createHandler = new CreateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve),
            uow,
            _clinicContext,
            TestDbHelper.CreateRepository<StaffMember>(db, sieve));

        var draft = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            DoctorId: _doctorId,
            DoctorName: "Dr. Elena Cruz",
            QueueItemId: queueItem.Id,
            Subjective: "Headache",
            Objective: "BP 130/85",
            Assessment: "Tension headache",
            Plan: "Analgesic",
            DoctorPrcLicense: "PRC-DRAFT-9001",
            DoctorPtr: "PTR-DRAFT-9002",
            DoctorS2License: "S2-DRAFT-9003",
            DoctorPhilHealthPan: "PAN-DRAFT-9004",
            Prescriptions: new List<PrescriptionInput>
            {
                new("Paracetamol", null, "500mg", "Tablet", "1 tab q6h PRN", 12, ClinicDispensedQuantity: 4, RosCategory: "Neurological")
            },
            DraftDiagnosticOrders: new List<DraftDiagnosticOrderDto>
            {
                new("svc-cbc", "CBC", "Complete Blood Count", "Laboratory", 250m, null, "outside", "Routine")
            },
            DraftWorkspace: new ConsultationDraftWorkspaceDto(MedCertPurpose: "Employment")), CancellationToken.None);

        var config = new ConfigurationBuilder().Build();
        var medCertHandler = new IssueMedicalCertificateCommandHandler(
            TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve),
            uow,
            _clinicContext,
            Substitute.For<IClinicIdentityProvider>(),
            Substitute.For<IPatientDocumentPublisher>(),
            new DocumentSecurityService(),
            config,
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve));

        await medCertHandler.Handle(new IssueMedicalCertificateCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            ConsultationId: draft.Id,
            DoctorId: _doctorId,
            DoctorName: "Dr. Elena Cruz",
            PrcLicenseNumber: "PRC-DRAFT-9001",
            PtrNumber: "PTR-DRAFT-9002",
            Diagnosis: "Tension headache",
            ClinicalFindings: "Normal neuro exam",
            QueueItemId: queueItem.Id), CancellationToken.None);

        var signHandler = new SignConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<StaffMember>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve),
            TestDbHelper.CreateRepository<Appointment>(db, sieve),
            TestDbHelper.CreateRepository<Patient>(db, sieve),
            uow,
            _clinicContext,
            Substitute.For<IClinicIdentityProvider>(),
            Substitute.For<IPatientAppointmentPublisher>(),
            Substitute.For<IPrescriptionPublisher>(),
            Substitute.For<IClaimSlipService>(),
            Substitute.For<IPatientDocumentPublisher>(),
            configuration: config,
            procedureRepository: TestDbHelper.CreateRepository<Procedure>(db, sieve),
            dispensingLogRepository: TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve),
            medCertRepository: TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve),
            referralRepository: TestDbHelper.CreateRepository<ReferralLetter>(db, sieve),
            labOrderRepository: TestDbHelper.CreateRepository<LabOrder>(db, sieve),
            documentSecurityService: new DocumentSecurityService());

        // Sign without re-supplying credentials in SignConsultationCommand -> uses drafted credentials persisted on ConsultationEncounter
        var signed = await signHandler.Handle(new SignConsultationCommand(draft.Id), CancellationToken.None);

        signed.IsSigned.Should().BeTrue();
        signed.DoctorPrcLicense.Should().Be("PRC-DRAFT-9001");
        signed.DoctorPtr.Should().Be("PTR-DRAFT-9002");
        signed.DoctorS2License.Should().Be("S2-DRAFT-9003");
        signed.DoctorPhilHealthPan.Should().Be("PAN-DRAFT-9004");
        signed.DraftDiagnosticOrders.Should().BeNull();
        signed.DraftWorkspace.Should().BeNull();

        var persistedEncounter = await db.Consultations.FirstAsync(c => c.Id == draft.Id);
        persistedEncounter.DraftOrdersJson.Should().BeNull();

        var persistedMedCert = await db.MedicalCertificates.SingleAsync(mc => mc.ConsultationId == draft.Id);
        persistedMedCert.IsSigned.Should().BeTrue();

        var persistedLabOrder = await db.LabOrders.SingleAsync(lo => lo.ConsultationId == draft.Id);
        persistedLabOrder.IsSigned.Should().BeTrue();

        db.ClinicDispensingLogs.Count(l => l.ConsultationEncounterId == draft.Id && l.QuantityDispensed == 4).Should().Be(1);
    }

    [Fact]
    public async Task AbandonConsultation_PurgesAllDraftEncounterCohortsAndUnsignedArtifacts_WithZeroOrphans()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var patientName = FormatPatientName(patient);
        db.Patients.Add(patient);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientName,
            QueueNumber = "Q-ABANDON-01",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.Consultation,
            Status = QueueStatus.InConsultation,
            CheckInTime = DateTime.UtcNow
        };
        db.QueueItems.Add(queueItem);

        var vitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            QueueItemId = queueItem.Id,
            SystolicBp = 118,
            DiastolicBp = 76,
            RecordedAt = DateTime.UtcNow
        };
        db.PatientVitals.Add(vitals);
        await uow.SaveChangesAsync();

        var createHandler = new CreateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve),
            uow,
            _clinicContext);

        var draft = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            DoctorId: _doctorId,
            DoctorName: "Dr. Elena Cruz",
            QueueItemId: queueItem.Id,
            Subjective: "Draft to be discarded",
            VisitWorkflowMode: "YakapAvailment",
            IsYakapEligible: true,
            ReviewOfSystemsItems: new List<ConsultationRosItemInput> { new(OptionCode: "FEVER", SymptomName: "Fever", IsPertinentPositive: true) },
            PhysicalExams: new List<ConsultationPhysicalExamDto>
            {
                new(GeneralSurveyId: "1", Findings: new List<ConsultationPhysicalExamFindingDto>
                {
                    new(System: "Skin", IsNormal: false, FindingTitle: "Pallor", OptionCode: "SK01", Remarks: "Mild")
                })
            },
            ObGyneExam: new ConsultationObGyneExamDto(Gravidity: 1, Parity: 0),
            PediatricMilestones: new List<ConsultationPediatricMilestoneDto>
            {
                new(MilestoneVisitAge: "6m", DangerSigns: new List<string> { "Convulsions" })
            },
            AdolescentAssessment: new ConsultationAdolescentAssessmentDto(TannerStage: 2),
            HeadsssAssessments: new List<ConsultationHeadsssAssessmentDto>
            {
                new(Domain: "EducationEmployment", AssessmentText: "Grade 8")
            },
            BpMonitoringLogs: new List<ConsultationBpMonitoringLogDto>
            {
                new(RecordedAt: "2026-11-11T09:00:00Z", Systolic: 118, Diastolic: 76)
            },
            Diagnoses: new List<DiagnosisInput> { new("R50.9", "Fever, unspecified", true) },
            Prescriptions: new List<PrescriptionInput> { new("Paracetamol", null, "500mg", "Tablet", "1 tab PRN", 10, ClinicDispensedQuantity: 2) },
            DraftDiagnosticOrders: new List<DraftDiagnosticOrderDto>
            {
                new("svc-ua", "UA", "Urinalysis", "Laboratory", 150m, null, "outside", "Midstream")
            }), CancellationToken.None);

        var abandonHandler = new AbandonConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve),
            uow,
            _clinicContext,
            diagnosisRepository: TestDbHelper.CreateRepository<EncounterDiagnosis>(db, sieve),
            prescriptionRepository: TestDbHelper.CreateRepository<PrescriptionItem>(db, sieve),
            rosRepository: TestDbHelper.CreateRepository<EncounterReviewOfSystemsItem>(db, sieve),
            physicalExamRepository: TestDbHelper.CreateRepository<PatientPhysicalExam>(db, sieve),
            physicalExamFindingRepository: TestDbHelper.CreateRepository<PatientPhysicalExamFinding>(db, sieve),
            dispensingLogRepository: TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve),
            medCertRepository: TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve),
            referralRepository: TestDbHelper.CreateRepository<ReferralLetter>(db, sieve),
            labOrderRepository: TestDbHelper.CreateRepository<LabOrder>(db, sieve),
            labOrderItemRepository: TestDbHelper.CreateRepository<LabOrderItem>(db, sieve),
            procedureRepository: TestDbHelper.CreateRepository<Procedure>(db, sieve));

        var abandoned = await abandonHandler.Handle(new AbandonConsultationCommand(draft.Id, "Discarded by physician"), CancellationToken.None);
        abandoned.Should().BeTrue();

        db.Consultations.Count(c => c.Id == draft.Id).Should().Be(0);
        db.Set<EncounterDiagnosis>().Count(d => d.ConsultationEncounterId == draft.Id).Should().Be(0);
        db.Set<PrescriptionItem>().Count(p => p.ConsultationEncounterId == draft.Id).Should().Be(0);
        db.Set<EncounterReviewOfSystemsItem>().Count(r => r.ConsultationEncounterId == draft.Id).Should().Be(0);
        db.Set<PatientPhysicalExam>().Count(pe => pe.ConsultationEncounterId == draft.Id).Should().Be(0);
        db.Set<EncounterObGyneExam>().Count(o => o.ConsultationEncounterId == draft.Id).Should().Be(0);
        db.Set<EncounterPediatricMilestone>().Count(m => m.ConsultationEncounterId == draft.Id).Should().Be(0);
        db.Set<EncounterAdolescentAssessment>().Count(a => a.ConsultationEncounterId == draft.Id).Should().Be(0);
        db.Set<EncounterHeadsssDomainAssessment>().Count(h => h.ConsultationEncounterId == draft.Id).Should().Be(0);
        db.Set<PatientBpMonitoringLog>().Count(b => b.ConsultationEncounterId == draft.Id).Should().Be(0);
        db.LabOrders.Count(lo => lo.ConsultationId == draft.Id).Should().Be(0);

        // Vitals remain preserved on the visit with ConsultationEncounterId unlinked, and QueueItem reverts to Triaged
        var survivingVitals = await db.PatientVitals.SingleAsync(v => v.Id == vitals.Id);
        survivingVitals.ConsultationEncounterId.Should().BeNull();

        var revertedQueue = await db.QueueItems.SingleAsync(q => q.Id == queueItem.Id);
        revertedQueue.Status.Should().Be(QueueStatus.Triaged);
    }

    [Fact]
    public async Task WorkflowModeToggle_SyncsBothConsultationEncounterAndQueueItem_AcrossCreateAndUpdate()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var patientName = FormatPatientName(patient);
        db.Patients.Add(patient);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientName,
            QueueNumber = "Q-MODE-01",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.Consultation,
            VisitWorkflowMode = VisitWorkflowMode.Regular,
            Status = QueueStatus.PendingProcedure,
            CheckInTime = DateTime.UtcNow
        };
        db.QueueItems.Add(queueItem);
        await uow.SaveChangesAsync();

        var createHandler = new CreateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve),
            uow,
            _clinicContext);

        // Physician toggles Regular -> YakapAvailment while patient is checked in as Regular
        var created = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            DoctorId: _doctorId,
            DoctorName: "Dr. Elena Cruz",
            QueueItemId: queueItem.Id,
            Subjective: "Switched to YAKAP",
            VisitWorkflowMode: "YakapAvailment",
            IsYakapEligible: true,
            PhilHealthAtc: "WALKEDIN"), CancellationToken.None);

        created.VisitWorkflowMode.Should().Be("YakapAvailment");
        created.IsYakapEligible.Should().BeTrue();
        var reloadedAfterCreate = await db.QueueItems.SingleAsync(q => q.Id == queueItem.Id);
        reloadedAfterCreate.VisitWorkflowMode.Should().Be(VisitWorkflowMode.YakapAvailment);
        reloadedAfterCreate.Status.Should().Be(QueueStatus.PendingProcedure);

        // Physician toggles YakapAvailment -> Regular on subsequent auto-save
        var updateHandler = new UpdateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<EncounterDiagnosis>(db, sieve),
            TestDbHelper.CreateRepository<PrescriptionItem>(db, sieve),
            uow,
            _clinicContext,
            rosRepository: TestDbHelper.CreateRepository<EncounterReviewOfSystemsItem>(db, sieve),
            queueRepository: TestDbHelper.CreateRepository<QueueItem>(db, sieve));

        var updated = await updateHandler.Handle(new UpdateConsultationCommand(
            Id: created.Id,
            Subjective: "Switched back to Regular",
            Objective: "",
            Assessment: "",
            Plan: "",
            VisitWorkflowMode: "Regular",
            IsYakapEligible: false,
            PhilHealthAtc: ""), CancellationToken.None);

        updated.VisitWorkflowMode.Should().Be("Regular");
        updated.IsYakapEligible.Should().BeFalse();
        var reloadedAfterUpdate = await db.QueueItems.SingleAsync(q => q.Id == queueItem.Id);
        reloadedAfterUpdate.VisitWorkflowMode.Should().Be(VisitWorkflowMode.Regular);
        reloadedAfterUpdate.Status.Should().Be(QueueStatus.PendingProcedure);
    }

    [Fact]
    public async Task AdversarialMaxLengthInputs_EveryPersistedEntityRespectsPostgreSqlModelMaxLengths_AndPreservesCohortJsonMetadata()
    {
        var sharedDbName = $"ClinicEz_MaxLength_{Guid.NewGuid()}";
        var (db1, uow1, sieve1) = TestDbHelper.CreateSharedTestContext(sharedDbName, _clinicContext);
        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        db1.Patients.Add(patient);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Dela Cruz, Juan",
            QueueNumber = "Q-MAX-01",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.Consultation,
            Status = QueueStatus.InConsultation,
            CheckInTime = DateTime.UtcNow
        };
        db1.QueueItems.Add(queueItem);
        await uow1.SaveChangesAsync();

        var overlong = new string('X', 2500);
        var createHandler = new CreateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db1, sieve1),
            TestDbHelper.CreateRepository<QueueItem>(db1, sieve1),
            uow1,
            _clinicContext);

        var created = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: overlong,
            DoctorId: _doctorId,
            DoctorName: overlong,
            QueueItemId: queueItem.Id,
            Subjective: overlong,
            Objective: overlong,
            Assessment: overlong,
            Plan: overlong,
            HomeInstructions: overlong,
            RosCategory: overlong,
            VisitWorkflowMode: "YakapAvailment",
            IsYakapEligible: true,
            PhilHealthAtc: overlong,
            PhilHealthSignSympCode: overlong,
            PhilHealthOtherComplaint: overlong,
            PhilHealthPainSite: overlong,
            GeneralSurveyId: overlong,
            GeneralSurveyRemarks: overlong,
            DoctorPrcLicense: overlong,
            DoctorPtr: overlong,
            DoctorS2License: overlong,
            DoctorPhilHealthPan: overlong,
            ReviewOfSystemsItems: new List<ConsultationRosItemInput>
            {
                new(OptionCode: overlong, SymptomName: overlong, IsPertinentPositive: true, PainSite: overlong, OthersSpecifyText: overlong)
            },
            PhysicalExams: new List<ConsultationPhysicalExamDto>
            {
                new(GeneralSurveyId: overlong, GeneralSurveyRemarks: overlong, Findings: new List<ConsultationPhysicalExamFindingDto>
                {
                    new(System: overlong, IsNormal: false, FindingTitle: overlong, OptionCode: overlong, PhilHealthFindingCode: overlong, Remarks: overlong)
                })
            },
            ObGyneExam: new ConsultationObGyneExamDto(
                Gravidity: 2,
                Parity: 1,
                FetalPresentation: overlong,
                Remarks: overlong),
            PediatricMilestones: new List<ConsultationPediatricMilestoneDto>
            {
                new(
                    MilestoneVisitAge: overlong,
                    GrossMotorStatus: overlong,
                    FineMotorStatus: overlong,
                    LanguageStatus: overlong,
                    CognitiveStatus: overlong,
                    SocialEmotionalStatus: overlong,
                    DangerSigns: new List<string> { overlong },
                    Remarks: overlong)
            },
            AdolescentAssessment: new ConsultationAdolescentAssessmentDto(
                TannerStage: 3,
                SmrBreastRating: overlong,
                SmrPubicHairRating: overlong,
                DepressionScreenPositive: true,
                Remarks: overlong),
            HeadsssAssessments: new List<ConsultationHeadsssAssessmentDto>
            {
                new(Domain: "Home", AssessmentText: overlong, HasRedFlags: true, RedFlags: new List<string> { overlong })
            },
            BpMonitoringLogs: new List<ConsultationBpMonitoringLogDto>
            {
                new(
                    RecordedAt: "2026-11-11T10:30:00Z",
                    Systolic: 142,
                    Diastolic: 92,
                    PulseBpm: 84,
                    Location: overlong,
                    Arm: overlong,
                    Remarks: overlong)
            },
            Diagnoses: new List<DiagnosisInput>
            {
                new(Icd10Code: overlong, Description: overlong, IsPrimary: true)
            },
            Prescriptions: new List<PrescriptionInput>
            {
                new(GenericName: overlong, BrandName: overlong, Dosage: overlong, Form: overlong, Sig: overlong, Quantity: 30, PhilHealthDrugCode: overlong, RosCategory: overlong)
            },
            DraftDiagnosticOrders: new List<DraftDiagnosticOrderDto>
            {
                new(ServiceItemId: overlong, Code: overlong, Name: overlong, Category: overlong, StandardPrice: 500m, PhilHealthCode: overlong, FulfillmentMode: "outside", Instructions: overlong)
            }), CancellationToken.None);

        // Programmatically assert EVERY tracked entity string property satisfies its EF Core PostgreSQL HasMaxLength constraint
        var maxLengthViolations = new List<string>();
        foreach (var entry in db1.ChangeTracker.Entries())
        {
            foreach (var prop in entry.Metadata.GetProperties().Where(p => p.ClrType == typeof(string)))
            {
                var maxLen = prop.GetMaxLength();
                if (maxLen.HasValue && entry.CurrentValues[prop] is string actualVal && actualVal.Length > maxLen.Value)
                {
                    maxLengthViolations.Add($"{entry.Metadata.ClrType.Name}.{prop.Name}: len={actualVal.Length} > max={maxLen.Value}");
                }
            }
        }
        maxLengthViolations.Should().BeEmpty("every persisted column must respect its PostgreSQL HasMaxLength constraint");

        // Reload via fresh DbContext to prove packed cohort metadata was NOT sliced mid-JSON by maxLength truncation
        var (db2, _, sieve2) = TestDbHelper.CreateSharedTestContext(sharedDbName, _clinicContext);
        var getByIdHandler = new GetConsultationByIdQueryHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db2, sieve2),
            _clinicContext);
        var reloaded = await getByIdHandler.Handle(new GetConsultationByIdQuery(created.Id), CancellationToken.None);

        reloaded.Should().NotBeNull();
        reloaded!.BpMonitoringLogs.Should().ContainSingle();
        reloaded.BpMonitoringLogs![0].PulseBpm.Should().Be(84);
        reloaded.BpMonitoringLogs[0].Location.Should().Be(overlong[..100]);
        reloaded.BpMonitoringLogs[0].Arm.Should().Be(overlong[..50]);
        reloaded.BpMonitoringLogs[0].Remarks.Should().NotBeNullOrEmpty();
        reloaded.BpMonitoringLogs[0].Remarks.Should().NotContain("__CLINICEZ_META__");

        reloaded.ObGyneExam.Should().NotBeNull();
        reloaded.ObGyneExam!.Gravidity.Should().Be(2);
        reloaded.ObGyneExam.FetalPresentation.Should().Be(overlong[..255]);
        reloaded.ObGyneExam.Remarks.Should().NotContain("__CLINICEZ_META__");

        reloaded.PediatricMilestones.Should().ContainSingle();
        reloaded.PediatricMilestones![0].CognitiveStatus.Should().Be(overlong[..500]);
        reloaded.PediatricMilestones[0].SocialEmotionalStatus.Should().Be(overlong[..500]);
        reloaded.PediatricMilestones[0].Remarks.Should().NotContain("__CLINICEZ_META__");

        reloaded.AdolescentAssessment.Should().NotBeNull();
        reloaded.AdolescentAssessment!.TannerStage.Should().Be(3);
        reloaded.AdolescentAssessment.DepressionScreenPositive.Should().BeTrue();
        reloaded.AdolescentAssessment.Remarks.Should().NotContain("__CLINICEZ_META__");
    }

    [Fact]
    public async Task ClearingAllDraftOrders_PersistsExplicitEmptyLists_AndUnsubmittedRxWorkspaceRoundTrips()
    {
        var sharedDbName = $"ClinicEz_EmptyOrders_{Guid.NewGuid()}";
        var (db1, uow1, sieve1) = TestDbHelper.CreateSharedTestContext(sharedDbName, _clinicContext);
        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var patientName = FormatPatientName(patient);
        db1.Patients.Add(patient);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientName,
            QueueNumber = "Q-EMPTY-01",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.Consultation,
            Status = QueueStatus.InConsultation,
            CheckInTime = DateTime.UtcNow
        };
        db1.QueueItems.Add(queueItem);
        await uow1.SaveChangesAsync();

        var createHandler = new CreateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db1, sieve1),
            TestDbHelper.CreateRepository<QueueItem>(db1, sieve1),
            uow1,
            _clinicContext);

        var draft = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            DoctorId: _doctorId,
            DoctorName: "Dr. Elena Cruz",
            QueueItemId: queueItem.Id,
            Subjective: "Initial order staging",
            DraftDiagnosticOrders: new List<DraftDiagnosticOrderDto>
            {
                new("svc-cbc", "CBC", "Complete Blood Count", "Diagnostic", 250m, null, "outside", "Routine")
            },
            DraftProcedures: new List<DraftProcedureOrderDto>
            {
                new("svc-neb", "NEB", "Nebulization", "Procedure", 300m, "Salbutamol", null, null, null, null, "draft", null, null, false, null)
            },
            DraftWorkspace: new ConsultationDraftWorkspaceDto(
                RxShowAddForm: true,
                RxDraftGeneric: "Cefuroxime",
                RxDraftDosage: "500mg",
                RxDraftForm: "Tablet",
                RxDraftSig: "1 tab BID",
                RxDraftQuantity: "14",
                RxDraftClinicDispensedQty: "4",
                RxDraftDangerous: false,
                RxDraftDrugCode: "CEFU500")), CancellationToken.None);

        db1.LabOrders.Count(lo => lo.ConsultationId == draft.Id).Should().Be(1);

        // Physician removes all staged diagnostic & procedure orders and updates the add-Rx composer
        var updateHandler = new UpdateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db1, sieve1),
            TestDbHelper.CreateRepository<EncounterDiagnosis>(db1, sieve1),
            TestDbHelper.CreateRepository<PrescriptionItem>(db1, sieve1),
            uow1,
            _clinicContext);

        var cleared = await updateHandler.Handle(new UpdateConsultationCommand(
            Id: draft.Id,
            Subjective: "Orders cleared",
            Objective: "",
            Assessment: "",
            Plan: "",
            DraftDiagnosticOrders: new List<DraftDiagnosticOrderDto>(),
            DraftProcedures: new List<DraftProcedureOrderDto>(),
            DraftDentalTeeth: new List<DraftDentalToothDto>(),
            DraftWorkspace: new ConsultationDraftWorkspaceDto(
                RxShowAddForm: true,
                RxDraftGeneric: "Azithromycin",
                RxDraftDosage: "500mg",
                RxDraftForm: "Tablet",
                RxDraftSig: "1 tab OD x 3 days",
                RxDraftQuantity: "3",
                RxDraftClinicDispensedQty: "1",
                RxDraftDangerous: false,
                RxDraftDrugCode: "AZIT500")), CancellationToken.None);

        // Unsigned LabOrder must be purged AND explicit empty arrays (not null!) preserved on reload
        db1.LabOrders.Count(lo => lo.ConsultationId == draft.Id).Should().Be(0);
        cleared.DraftDiagnosticOrders.Should().NotBeNull().And.BeEmpty();
        cleared.DraftProcedures.Should().NotBeNull().And.BeEmpty();
        cleared.DraftDentalTeeth.Should().NotBeNull().And.BeEmpty();

        var (db2, _, sieve2) = TestDbHelper.CreateSharedTestContext(sharedDbName, _clinicContext);
        var getByIdHandler = new GetConsultationByIdQueryHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db2, sieve2),
            _clinicContext);
        var reloaded = await getByIdHandler.Handle(new GetConsultationByIdQuery(draft.Id), CancellationToken.None);

        reloaded!.DraftDiagnosticOrders.Should().NotBeNull().And.BeEmpty();
        reloaded.DraftProcedures.Should().NotBeNull().And.BeEmpty();
        reloaded.DraftDentalTeeth.Should().NotBeNull().And.BeEmpty();
        reloaded.DraftWorkspace.Should().NotBeNull();
        reloaded.DraftWorkspace!.RxShowAddForm.Should().BeTrue();
        reloaded.DraftWorkspace.RxDraftGeneric.Should().Be("Azithromycin");
        reloaded.DraftWorkspace.RxDraftDosage.Should().Be("500mg");
        reloaded.DraftWorkspace.RxDraftSig.Should().Be("1 tab OD x 3 days");
        reloaded.DraftWorkspace.RxDraftQuantity.Should().Be("3");
        reloaded.DraftWorkspace.RxDraftClinicDispensedQty.Should().Be("1");
        reloaded.DraftWorkspace.RxDraftDrugCode.Should().Be("AZIT500");
    }

    [Fact]
    public async Task AbandonDirectVisitConsultation_WithSurvivingCompletedProcedure_CancelsInsteadOfHardDeletingQueueItem()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var patientName = FormatPatientName(patient);
        db.Patients.Add(patient);

        var directQueueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientName,
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.Consultation,
            IsDirectVisit = true,
            Status = QueueStatus.ReEvaluation,
            CheckInTime = DateTime.UtcNow
        };
        db.QueueItems.Add(directQueueItem);

        var createHandler = new CreateConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve),
            uow,
            _clinicContext);

        var draft = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: patientName,
            DoctorId: _doctorId,
            DoctorName: "Dr. Elena Cruz",
            QueueItemId: directQueueItem.Id,
            Subjective: "Direct visit with executed nebulization"), CancellationToken.None);

        var executedProc = new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientName,
            QueueItemId = directQueueItem.Id,
            ConsultationId = draft.Id,
            ProcedureName = "Nebulization",
            Category = "Procedure",
            Status = ProcedureStatus.Completed,
            OrderedByDoctorId = _doctorId,
            OrderedByDoctorName = "Dr. Elena Cruz"
        };
        db.Procedures.Add(executedProc);
        await uow.SaveChangesAsync();

        var abandonHandler = new AbandonConsultationCommandHandler(
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<QueueItem>(db, sieve),
            uow,
            _clinicContext,
            procedureRepository: TestDbHelper.CreateRepository<Procedure>(db, sieve));

        var abandoned = await abandonHandler.Handle(
            new AbandonConsultationCommand(draft.Id, "Patient left before doctor sign-off"),
            CancellationToken.None);

        abandoned.Should().BeTrue();
        db.Consultations.Count(c => c.Id == draft.Id).Should().Be(0);

        // Executed procedure survives with ConsultationId unlinked, and direct-visit QueueItem is Cancelled (NOT hard-deleted)
        var survivingProc = await db.Procedures.SingleAsync(p => p.Id == executedProc.Id);
        survivingProc.ConsultationId.Should().BeNull();
        survivingProc.QueueItemId.Should().Be(directQueueItem.Id);

        var survivingQueue = await db.QueueItems.SingleAsync(q => q.Id == directQueueItem.Id);
        survivingQueue.Status.Should().Be(QueueStatus.Cancelled);
    }
}
