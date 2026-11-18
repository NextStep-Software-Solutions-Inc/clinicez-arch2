using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Dispensing.Commands;
using ClinicEz.Clinic.Application.Features.Dispensing.DTOs;
using ClinicEz.Clinic.Application.Features.Dispensing.Queries;
using ClinicEz.Clinic.Application.Features.Documents.Commands;
using ClinicEz.Clinic.Application.Features.Documents.Queries;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.LabOrders.Search;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Prescriptions.Commands;
using ClinicEz.Clinic.Application.Features.Prescriptions.Queries;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Application.Features.Triage.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Exceptions;
using ClosedXML.Excel;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicDispensingAndVisitValidityTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string TenantId = "tenant-dispensing-validity";
    private readonly IClinicContext _clinicContext;

    public ClinicDispensingAndVisitValidityTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(TenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
        _clinicContext.StaffName.Returns("Dr. Elena Cruz");
    }

    [Fact]
    public async Task PrescribingPrivilege_RemainsStrictlyRestrictedToDoctors_NursesCannotPrescribe()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);

        var nurse = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Clara",
            LastName = "Bautista",
            Email = "nurse.clara@clinic.test",
            Role = StaffRole.Nurse,
            IsActive = true
        };
        await staffRepo.AddAsync(nurse);
        await uow.SaveChangesAsync();

        var handler = new CreateConsultationCommandHandler(consultRepo, queueRepo, uow, _clinicContext, staffRepo);

        var act = async () => await handler.Handle(new CreateConsultationCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Santos, Juan",
            DoctorId: nurse.Id,
            DoctorName: "Nurse Clara Bautista",
            Prescriptions: new List<PrescriptionInput>
            {
                new("Amoxicillin", "Amoxil", "500mg", "Capsule", "1 cap TID x 7 days", 21, ClinicDispensedQuantity: 3)
            }), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*Prescribing privileges*restricted*");
    }

    [Theory]
    [InlineData((VisitType)6)]
    [InlineData((VisitType)7)]
    [InlineData((VisitType)99)]
    public async Task TwoScenarioRule_RejectsMedicineDispensing_WhenVisitIsNeitherConsultationNorVitalsCheck(VisitType disallowedVisitType)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var dispensingRepo = TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve);

        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        await patientRepo.AddAsync(patient);

        var queueItem = new QueueItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Santos, Maria",
            QueueNumber = "Q-DISALLOWED",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = disallowedVisitType,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };
        await queueRepo.AddAsync(queueItem);
        await uow.SaveChangesAsync();

        var handler = new RecordTriageVitalsCommandHandler(
            queueRepo, vitalsRepo, patientRepo, uow, _clinicContext, null, dispensingRepo);

        var act = async () => await handler.Handle(new RecordTriageVitalsCommand(
            QueueItemId: queueItem.Id,
            NurseId: Guid.NewGuid(),
            RecordedByNurseName: "Nurse Clara",
            SystolicBp: 120,
            DiastolicBp: 80,
            HeartRateBpm: 72,
            TemperatureCelsius: 36.7m,
            RespiratoryRateBreathsPerMin: 18,
            OxygenSaturationPercent: 99m,
            HeightCm: 162m,
            WeightKg: 58m,
            PainScore: 2,
            Notes: "Walk-in request",
            DispensedItems: new List<TriageDispensedItemInput>
            {
                new("Paracetamol", "Medicine", "500mg", "Tablet", 2, "Take 1 tab q6h PRN", "Neurological")
            }), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*valid clinical VisitType*");
    }

    [Theory]
    [InlineData(-1, 10)]
    [InlineData(12, 10)]
    public async Task ConsultationDispensing_RejectsInvalidClinicDispensedQuantityBounds(int clinicDispensedQty, int prescribedQty)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);

        var handler = new CreateConsultationCommandHandler(consultRepo, queueRepo, uow, _clinicContext);

        var act = async () => await handler.Handle(new CreateConsultationCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Reyes, Carlo",
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Elena Cruz",
            Prescriptions: new List<PrescriptionInput>
            {
                new("Cefalexin", null, "500mg", "Capsule", "1 cap QID", prescribedQty, ClinicDispensedQuantity: clinicDispensedQty)
            }), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Scenario1_DoctorConsultation_DefersValidityUntilSignOff_AndWritesUnifiedDispensingLedgerOnSign()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var dispensingRepo = TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<LabOrder>(db, sieve);
        var labResultRepo = TestDbHelper.CreateRepository<LabResult>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);

        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId, syncPatientId: Guid.NewGuid());
        var doctor = Phase3TestKit.NewDoctor(_clinicId, TenantId);
        await patientRepo.AddAsync(patient);
        await staffRepo.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Santos, Maria",
            QueueNumber = "Q-101",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.RoutineCheckup,
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Triaged,
            DoctorId = doctor.Id,
            DoctorName = "Dr. Ana Cruz",
            CheckInTime = DateTime.UtcNow.AddMinutes(-20)
        };
        await queueRepo.AddAsync(queueItem);
        await uow.SaveChangesAsync();

        // 1. Create unsigned consultation draft with Rx + Clinic Stock Dispensing (2 of 10 pieces) + ROS Category
        var createConsultHandler = new CreateConsultationCommandHandler(consultRepo, queueRepo, uow, _clinicContext, staffRepo);
        var draftConsult = await createConsultHandler.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: "Santos, Maria",
            DoctorId: doctor.Id,
            DoctorName: "Dr. Ana Cruz",
            QueueItemId: queueItem.Id,
            Subjective: "Productive cough and sore throat for 2 days",
            Assessment: "Acute Upper Respiratory Tract Infection",
            RosCategory: "Respiratory",
            Diagnoses: new List<DiagnosisInput> { new("J06.9", "Acute upper respiratory infection", true) },
            Prescriptions: new List<PrescriptionInput>
            {
                new("Carbocisteine", "Solmux", "500mg", "Capsule", "Take 1 cap every 8 hours", 10,
                    ClinicDispensedQuantity: 2, RosCategory: "Respiratory")
            }), CancellationToken.None);

        draftConsult.IsSigned.Should().BeFalse();
        draftConsult.RosCategoryLabel.Should().Be("Respiratory");
        draftConsult.Prescriptions.Should().ContainSingle();
        draftConsult.Prescriptions[0].ClinicDispensedQuantity.Should().Be(2);
        draftConsult.Prescriptions[0].IsClinicDispensed.Should().BeFalse("not valid until consultation is signed");

        // Issue MedCert, Referral, and LabOrder during the UNSIGNED consultation
        var identity = Phase3TestKit.Identity(_clinicId, TenantId);
        var docPublisher = Phase3TestKit.Documents(db);
        var security = new DocumentSecurityService();
        var config = new ConfigurationBuilder().Build();
        var uploadGrants = Phase3TestKit.Grants(db);
        var claims = Phase3TestKit.Claims();
        var labPublisher = Substitute.For<ILabRequisitionPublisher>();

        var medCertHandler = new IssueMedicalCertificateCommandHandler(
            medCertRepo, uow, _clinicContext, identity, docPublisher, security, config, consultRepo, queueRepo);
        var issuedCert = await medCertHandler.Handle(new IssueMedicalCertificateCommand(
            PatientId: patient.Id,
            PatientName: "Santos, Maria",
            ConsultationId: draftConsult.Id,
            DoctorId: doctor.Id,
            DoctorName: "Dr. Ana Cruz",
            PrcLicenseNumber: "0123456",
            PtrNumber: "PTR-001",
            Diagnosis: "Acute URTI",
            ClinicalFindings: "Hyperemic pharynx",
            RecommendedRestDays: 2,
            QueueItemId: queueItem.Id), CancellationToken.None);

        var referralHandler = new IssueReferralLetterCommandHandler(
            referralRepo, uow, _clinicContext, security, staffRepo, consultRepo, queueRepo);
        var issuedRef = await referralHandler.Handle(new IssueReferralLetterCommand(
            PatientId: patient.Id,
            PatientName: "Santos, Maria",
            ConsultationId: draftConsult.Id,
            ReferringDoctorId: doctor.Id,
            ReferringDoctorName: "Dr. Ana Cruz",
            ReferredToDoctor: "Dr. Pulmo",
            ReferredToFacility: "Lung Center",
            ReferredDepartment: "Pulmonology",
            Urgency: "Routine",
            ReasonForReferral: "Persistent cough evaluation",
            ProvisionalDiagnosis: "Acute URTI",
            ClinicalSummary: "Stable vitals, clear lungs",
            QueueItemId: queueItem.Id), CancellationToken.None);

        var labHandler = new CreateClinicLabOrderCommandHandler(
            labOrderRepo, patientRepo, staffRepo, uow, _clinicContext, identity,
            labPublisher, uploadGrants, claims, docPublisher, null, consultRepo, queueRepo);
        var issuedLab = await labHandler.Handle(new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Santos, Maria",
            ConsultationId: draftConsult.Id,
            OrderedByDoctorId: doctor.Id,
            OrderedByDoctorName: "Dr. Ana Cruz",
            ClinicalDiagnosis: "Acute URTI",
            Items: new List<CreateLabOrderItemRequest> { new("Complete Blood Count (CBC)", "Hematology", null) },
            QueueItemId: queueItem.Id), CancellationToken.None);

        // Assert ALL artifacts are pending sign-off & blocked from external/official use while encounter is unsigned
        issuedCert.IsSigned.Should().BeFalse();
        issuedRef.IsSigned.Should().BeFalse();
        issuedLab.IsSigned.Should().BeFalse();
        issuedLab.PublicUploadUrl.Should().BeNull();

        (await new GetClinicDispensingLogsQueryHandler(dispensingRepo, _clinicContext, queueRepo, null, consultRepo)
            .Handle(new GetClinicDispensingLogsQuery(), CancellationToken.None)).Should().BeEmpty();

        (await new GetMedicalCertificatesQueryHandler(medCertRepo)
            .Handle(new GetMedicalCertificatesQuery(patient.Id), CancellationToken.None)).Should().BeEmpty();

        (await new GetReferralLettersQueryHandler(referralRepo)
            .Handle(new GetReferralLettersQuery(patient.Id), CancellationToken.None)).Should().BeEmpty();

        (await new GetClinicLabOrdersQueryHandler(labOrderRepo, labResultRepo, _clinicContext)
            .Handle(new GetClinicLabOrdersQuery(PatientId: patient.Id), CancellationToken.None)).Should().BeEmpty();

        // Slip & external dispense endpoints reject unsigned consultation artifacts
        var rxSlipHandler = new GetPrescriptionSlipQueryHandler(consultRepo, patientRepo, staffRepo, settingsRepo, uow);
        await FluentActions.Invoking(() => rxSlipHandler.Handle(new GetPrescriptionSlipQuery(draftConsult.Id), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        var extDispenseHandler = new RecordExternalDispenseCommandHandler(consultRepo, uow, Substitute.For<ISender>());
        await FluentActions.Invoking(() => extDispenseHandler.Handle(
                new RecordExternalDispenseCommand(draftConsult.Id, "Mercury Drug", null, null, null, "OR-1", null, null),
                CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        var labSlipHandler = new GetClinicLabOrderSlipQueryHandler(labOrderRepo, patientRepo, settingsRepo, staffRepo, uploadGrants, uow);
        await FluentActions.Invoking(() => labSlipHandler.Handle(new GetClinicLabOrderSlipQuery(issuedLab.Id), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>();

        // 2. Sign Consultation -> validates & finalizes Rx, Clinic Dispensing Ledger, MedCert, Referral, and LabOrder!
        var signHandler = new SignConsultationCommandHandler(
            consultRepo,
            staffRepo,
            queueRepo,
            apptRepo,
            patientRepo,
            uow,
            _clinicContext,
            identity,
            Substitute.For<IPatientAppointmentPublisher>(),
            Substitute.For<IPrescriptionPublisher>(),
            claims,
            docPublisher,
            null,
            config,
            null,
            dispensingRepo,
            medCertRepo,
            referralRepo,
            labOrderRepo,
            uploadGrants,
            labPublisher,
            security);

        var signedDto = await signHandler.Handle(new SignConsultationCommand(draftConsult.Id, PrcLicenseNumber: "0123456"), CancellationToken.None);

        signedDto.IsSigned.Should().BeTrue();
        signedDto.Prescriptions.Should().ContainSingle();
        signedDto.Prescriptions[0].IsClinicDispensed.Should().BeTrue();
        signedDto.Prescriptions[0].ClinicDispensedQuantity.Should().Be(2);
        // PhilHealth YAKAP GAMOT / external pharmacy DispensedQuantity remains untouched!
        var persistedRx = await db.Prescriptions.SingleAsync(p => p.ConsultationEncounterId == draftConsult.Id);
        persistedRx.IsDispensed.Should().BeFalse();
        persistedRx.DispensedQuantity.Should().BeNull();
        persistedRx.IsClinicDispensed.Should().BeTrue();
        persistedRx.ClinicDispensedQuantity.Should().Be(2);

        // Unified Dispensing Ledger has 1 validated DoctorConsultation row
        var logs = await new GetClinicDispensingLogsQueryHandler(dispensingRepo, _clinicContext, queueRepo, null, consultRepo)
            .Handle(new GetClinicDispensingLogsQuery(), CancellationToken.None);
        logs.Should().ContainSingle();
        logs[0].Source.Should().Be("DoctorConsultation");
        logs[0].ItemName.Should().Contain("Carbocisteine");
        logs[0].QuantityDispensed.Should().Be(2);
        logs[0].RosCategoryLabel.Should().Be("Respiratory");
        logs[0].RequiresDoctorReview.Should().BeFalse();

        // MedCert, Referral, and LabOrder are now signed and visible
        (await new GetMedicalCertificatesQueryHandler(medCertRepo)
            .Handle(new GetMedicalCertificatesQuery(patient.Id), CancellationToken.None))
            .Should().ContainSingle(m => m.IsSigned && !string.IsNullOrWhiteSpace(m.SecurityDigest));

        (await new GetReferralLettersQueryHandler(referralRepo)
            .Handle(new GetReferralLettersQuery(patient.Id), CancellationToken.None))
            .Should().ContainSingle(r => r.IsSigned);

        (await new GetClinicLabOrdersQueryHandler(labOrderRepo, labResultRepo, _clinicContext)
            .Handle(new GetClinicLabOrdersQuery(PatientId: patient.Id), CancellationToken.None))
            .Should().ContainSingle(o => o.IsSigned);
    }

    [Fact]
    public async Task Pillar5_ZeroOrphanRevert_PurgesAllUnsignedConsultationArtifacts_OnAbandon_Cancel_AndEodReconcile()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var diagRepo = TestDbHelper.CreateRepository<EncounterDiagnosis>(db, sieve);
        var rxRepo = TestDbHelper.CreateRepository<PrescriptionItem>(db, sieve);
        var rosRepo = TestDbHelper.CreateRepository<EncounterReviewOfSystemsItem>(db, sieve);
        var peRepo = TestDbHelper.CreateRepository<PatientPhysicalExam>(db, sieve);
        var pefRepo = TestDbHelper.CreateRepository<PatientPhysicalExamFinding>(db, sieve);
        var dispensingRepo = TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<LabOrder>(db, sieve);
        var labItemRepo = TestDbHelper.CreateRepository<LabOrderItem>(db, sieve);
        var grantRepo = TestDbHelper.CreateRepository<UploadGrant>(db, sieve);
        var dentalRepo = TestDbHelper.CreateRepository<DentalToothRecord>(db, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(db, sieve);

        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var doctor = Phase3TestKit.NewDoctor(_clinicId, TenantId);
        await patientRepo.AddAsync(patient);
        await staffRepo.AddAsync(doctor);
        await uow.SaveChangesAsync();

        var identity = Phase3TestKit.Identity(_clinicId, TenantId);
        var docPublisher = Phase3TestKit.Documents(db);
        var security = new DocumentSecurityService();
        var config = new ConfigurationBuilder().Build();
        var uploadGrants = Phase3TestKit.Grants(db);
        var claims = Phase3TestKit.Claims();
        var labPublisher = Substitute.For<ILabRequisitionPublisher>();

        async Task<(QueueItem Queue, Guid ConsultId)> SeedUnsignedConsultationBundleAsync(string ticketNo, QueueStatus statusAfterDraft)
        {
            var q = new QueueItem
            {
                TenantId = TenantId,
                ClinicId = _clinicId,
                PatientId = patient.Id,
                PatientName = "Santos, Maria",
                QueueNumber = ticketNo,
                SequenceNumber = 1,
                QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
                VisitType = VisitType.RoutineCheckup,
                Status = QueueStatus.Triaged,
                CheckInTime = DateTime.UtcNow
            };
            await queueRepo.AddAsync(q);
            await uow.SaveChangesAsync();

            var draft = await new CreateConsultationCommandHandler(consultRepo, queueRepo, uow, _clinicContext, staffRepo)
                .Handle(new CreateConsultationCommand(
                    PatientId: patient.Id,
                    PatientName: "Santos, Maria",
                    DoctorId: doctor.Id,
                    DoctorName: "Dr. Ana Cruz",
                    QueueItemId: q.Id,
                    RosCategory: "Dermatologic",
                    ReviewOfSystemsItems: new List<ConsultationRosItemInput>
                    {
                        new(System: "Dermatologic", SymptomName: "Pruritic rash", IsPertinentPositive: true)
                    },
                    Diagnoses: new List<DiagnosisInput> { new("L23.9", "Allergic contact dermatitis", true) },
                    Prescriptions: new List<PrescriptionInput>
                    {
                        new("Cetirizine", null, "10mg", "Tablet", "1 tab OD", 10, ClinicDispensedQuantity: 2, RosCategory: "Dermatologic")
                    }), CancellationToken.None);

            await new IssueMedicalCertificateCommandHandler(medCertRepo, uow, _clinicContext, identity, docPublisher, security, config, consultRepo, queueRepo)
                .Handle(new IssueMedicalCertificateCommand(
                    patient.Id, "Santos, Maria", draft.Id, doctor.Id, "Dr. Ana Cruz", "0123456", null, "Allergic dermatitis", "Maculopapular rash", QueueItemId: q.Id),
                    CancellationToken.None);

            await new IssueReferralLetterCommandHandler(referralRepo, uow, _clinicContext, security, staffRepo, consultRepo, queueRepo)
                .Handle(new IssueReferralLetterCommand(
                    patient.Id, "Santos, Maria", draft.Id, doctor.Id, "Dr. Ana Cruz", null, "Skin Institute", "Dermatology", "Routine", "Patch test", "Dermatitis", "Rash x 3d", QueueItemId: q.Id),
                    CancellationToken.None);

            await new CreateClinicLabOrderCommandHandler(labOrderRepo, patientRepo, staffRepo, uow, _clinicContext, identity, labPublisher, uploadGrants, claims, docPublisher, null, consultRepo, queueRepo)
                .Handle(new CreateClinicLabOrderCommand(
                    patient.Id, "Santos, Maria", draft.Id, doctor.Id, "Dr. Ana Cruz", "Dermatitis", null,
                    new List<CreateLabOrderItemRequest> { new("Total IgE", "Immunology", null) }, QueueItemId: q.Id),
                    CancellationToken.None);

            if (statusAfterDraft != QueueStatus.InConsultation)
            {
                q.Status = statusAfterDraft;
                queueRepo.Update(q);
                await uow.SaveChangesAsync();
            }

            return (q, draft.Id);
        }

        // Case A: Explicit AbandonConsultationCommand
        var (_, consultA) = await SeedUnsignedConsultationBundleAsync("Q-ABANDON", QueueStatus.InConsultation);
        var abandonHandler = new AbandonConsultationCommandHandler(
            consultRepo, queueRepo, uow, _clinicContext,
            diagRepo, rxRepo, rosRepo, peRepo, pefRepo, dispensingRepo, medCertRepo, referralRepo, labOrderRepo, labItemRepo, grantRepo, dentalRepo, procRepo);

        (await abandonHandler.Handle(new AbandonConsultationCommand(consultA, "Patient walked out before sign-off", CancelVisit: true), CancellationToken.None))
            .Should().BeTrue();

        // Case B: CancelQueueTicketCommand
        var (queueB, _) = await SeedUnsignedConsultationBundleAsync("Q-CANCEL", QueueStatus.InConsultation);
        var cancelHandler = new CancelQueueTicketCommandHandler(
            queueRepo, uow, _clinicContext, null,
            consultRepo, diagRepo, rxRepo, rosRepo, peRepo, pefRepo, dispensingRepo, medCertRepo, referralRepo, labOrderRepo, labItemRepo, grantRepo, dentalRepo, procRepo);
        await cancelHandler.Handle(new CancelQueueTicketCommand(queueB.Id, "Left clinic"), CancellationToken.None);

        // Case C: ReconcileEodCommand (OnHold unsigned consultation closed at EOD)
        await SeedUnsignedConsultationBundleAsync("Q-EOD", QueueStatus.OnHold);
        var eodHandler = new ReconcileEodCommandHandler(
            queueRepo, auditRepo, uow, _clinicContext, null, null,
            consultRepo, diagRepo, rxRepo, rosRepo, peRepo, pefRepo, dispensingRepo, medCertRepo, referralRepo, labOrderRepo, labItemRepo, grantRepo, dentalRepo, procRepo);
        await eodHandler.Handle(new ReconcileEodCommand(DateOnly.FromDateTime(DateTime.UtcNow), "Manual", "EOD cleanup"), CancellationToken.None);

        // Verify ZERO orphan rows remain across ALL tables even with IgnoreQueryFilters()!
        (await db.Consultations.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.Diagnoses.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.Prescriptions.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.Set<EncounterReviewOfSystemsItem>().IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.ClinicDispensingLogs.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.MedicalCertificates.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.ReferralLetters.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.LabOrders.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.LabOrderItems.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.UploadGrants.IgnoreQueryFilters().CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Scenario2_NurseVitalsCheck_LogsOtcAndSuppliesWithoutPriorApproval_SupportsAsyncDoctorReview_AndStatEscalation()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(db, sieve);
        var dispensingRepo = TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve);

        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var nurse = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Clara",
            LastName = "Bautista",
            Email = "clara@clinic.test",
            Role = StaffRole.Nurse,
            IsActive = true
        };
        var doctor = Phase3TestKit.NewDoctor(_clinicId, TenantId);
        await patientRepo.AddAsync(patient);
        await staffRepo.AddAsync(nurse);
        await staffRepo.AddAsync(doctor);

        var routineVisit = new QueueItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Santos, Maria",
            QueueNumber = "V-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Waiting,
            ChiefComplaint = "Tension headache after exam week",
            CheckInTime = DateTime.UtcNow.AddMinutes(-10)
        };
        await queueRepo.AddAsync(routineVisit);
        await uow.SaveChangesAsync();

        // Nurse logs vitals, complaint, pre-assessment, home instructions, ROS category, and OTC medicine + medical supply
        var triageHandler = new RecordTriageVitalsCommandHandler(
            queueRepo, vitalsRepo, patientRepo, uow, _clinicContext, null, dispensingRepo);

        var vitalsDto = await triageHandler.Handle(new RecordTriageVitalsCommand(
            QueueItemId: routineVisit.Id,
            NurseId: nurse.Id,
            RecordedByNurseName: "Nurse Clara Bautista",
            SystolicBp: 118,
            DiastolicBp: 76,
            HeartRateBpm: 74,
            TemperatureCelsius: 36.8m,
            RespiratoryRateBreathsPerMin: 16,
            OxygenSaturationPercent: 99m,
            HeightCm: 160m,
            WeightKg: 54m,
            PainScore: 4,
            Notes: "Alert, non-focal neuro exam",
            PreAssessmentNotes: "Mild bilateral temporal headache, well hydrated",
            HomeInstructions: "Rest in quiet room, hydrate orally, return immediately if vision changes or vomiting occur",
            RosCategory: "Neurological",
            ChiefComplaint: "Tension headache after exam week",
            DispensedItems: new List<TriageDispensedItemInput>
            {
                new("Paracetamol", "Medicine", "500mg", "Tablet", 2, "Take 1 tablet now and 1 tablet after 6 hours if needed", "Neurological"),
                new("Cooling Gel Patch", "MedicalSupply", "Adult", "Sheet", 1, "Apply to forehead", "Neurological")
            }), CancellationToken.None);

        vitalsDto.HomeInstructions.Should().Contain("Rest in quiet room");
        vitalsDto.RosCategoryLabel.Should().Be("Neurological");
        vitalsDto.DispensedItems.Should().HaveCount(2);

        // Immediately visible in unreviewed doctor queue (no prior doctor approval required)
        var queryHandler = new GetClinicDispensingLogsQueryHandler(dispensingRepo, _clinicContext, queueRepo, vitalsRepo);
        var unreviewed = await queryHandler.Handle(new GetClinicDispensingLogsQuery(UnreviewedOnly: true), CancellationToken.None);
        unreviewed.Should().HaveCount(2);
        unreviewed.Should().OnlyContain(d => d.RequiresDoctorReview && !d.ReviewedAt.HasValue && d.ChiefComplaint == "Tension headache after exam week");

        // Nurse cannot review their own OTC dispensing (physician-only RBAC)
        var reviewHandler = new ReviewClinicDispensingLogCommandHandler(
            dispensingRepo, uow, _clinicContext, staffRepo, queueRepo, vitalsRepo);
        await FluentActions.Invoking(() => reviewHandler.Handle(
                new ReviewClinicDispensingLogCommand(unreviewed[0].Id, DoctorId: nurse.Id, DoctorName: "Nurse Clara"),
                CancellationToken.None))
            .Should().ThrowAsync<ForbiddenException>();

        // Doctor asynchronously reviews & flags follow-up note
        var reviewed = await reviewHandler.Handle(new ReviewClinicDispensingLogCommand(
            Id: unreviewed[0].Id,
            DoctorId: doctor.Id,
            DoctorName: "Dr. Ana Cruz",
            ReviewNotes: "Appropriate starter OTC dose; advise follow-up if recurrent >3x/week",
            InterventionFlagged: true), CancellationToken.None);

        reviewed.ReviewedAt.Should().NotBeNull();
        reviewed.ReviewedByDoctorName.Should().Be("Dr. Ana Cruz");
        reviewed.InterventionFlagged.Should().BeTrue();

        // Emergency/STAT case: Nurse escalates a VitalsCheckOnly visit to a Doctor Consultation
        var statVisit = new QueueItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Santos, Maria",
            QueueNumber = "V-002",
            SequenceNumber = 2,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Triaged,
            CheckInTime = DateTime.UtcNow
        };
        await queueRepo.AddAsync(statVisit);
        await uow.SaveChangesAsync();

        var escalateHandler = new EscalateVitalsToConsultationCommandHandler(queueRepo, uow, _clinicContext, vitalsRepo);
        var escalated = await escalateHandler.Handle(new EscalateVitalsToConsultationCommand(
            QueueItemId: statVisit.Id,
            Priority: QueuePriority.Emergency,
            EscalationReason: "BP 190/115 with acute visual blurring — STAT physician evaluation",
            DoctorId: doctor.Id,
            DoctorName: "Dr. Ana Cruz"), CancellationToken.None);

        escalated.VisitType.Should().Be(VisitType.UrgentCareVisit);
        escalated.Priority.Should().Be(QueuePriority.Emergency);
        escalated.Status.Should().Be(QueueStatus.Triaged);
        escalated.DoctorId.Should().Be(doctor.Id);
    }

    [Fact]
    public async Task Pillar3And4_ClinicCensus_OneRowPerVisit_ShowsAllServicesAvailed_RosCategories_AndUnifiedDispensingLedger()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(db, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(db, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var dispensingRepo = TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<LabOrder>(db, sieve);

        var visitDay = new DateTime(2026, 11, 10, 0, 0, 0, DateTimeKind.Utc);

        var p1 = Phase3TestKit.NewPatient(_clinicId, TenantId);
        p1.FirstName = "Miguel";
        p1.LastName = "Dela Cruz";
        var p2 = Phase3TestKit.NewPatient(_clinicId, TenantId);
        p2.FirstName = "Hannah";
        p2.LastName = "Reyes";
        var p3 = Phase3TestKit.NewPatient(_clinicId, TenantId);
        p3.FirstName = "Paolo";
        p3.LastName = "Lim";
        await patientRepo.AddAsync(p1);
        await patientRepo.AddAsync(p2);
        await patientRepo.AddAsync(p3);

        // Visit 1: Doctor Consultation (includes vitals in package) + Medicine Dispensing + Prescription + MedCert + Referral + Lab Requisition
        var q1 = new QueueItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = p1.Id,
            PatientName = "Dela Cruz, Miguel",
            QueueNumber = "C-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(visitDay),
            VisitType = VisitType.RoutineCheckup,
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Completed,
            DoctorName = "Dr. Ana Cruz",
            ChiefComplaint = "Acute bronchitis",
            CheckInTime = visitDay.AddHours(8),
            CompletedTime = visitDay.AddHours(8).AddMinutes(35)
        };
        // Visit 2: Routine Nurse Vitals Check + OTC Medicine Dispensing
        var q2 = new QueueItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = p2.Id,
            PatientName = "Reyes, Hannah",
            QueueNumber = "V-002",
            SequenceNumber = 2,
            QueueDate = DateOnly.FromDateTime(visitDay),
            VisitType = VisitType.PreventiveHealthAssessment,
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Completed,
            ChiefComplaint = "Mild dysmenorrhea",
            CheckInTime = visitDay.AddHours(9),
            CompletedTime = visitDay.AddHours(9).AddMinutes(15)
        };
        // Visit 3: Annual Physical Checkup Consultation with ROS = Essentially Normal
        var q3 = new QueueItem
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = p3.Id,
            PatientName = "Lim, Paolo",
            QueueNumber = "C-003",
            SequenceNumber = 3,
            QueueDate = DateOnly.FromDateTime(visitDay),
            VisitType = VisitType.RoutineCheckup,
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Completed,
            DoctorName = "Dr. Ana Cruz",
            ChiefComplaint = "Routine university clearance",
            CheckInTime = visitDay.AddHours(10),
            CompletedTime = visitDay.AddHours(10).AddMinutes(20)
        };
        await queueRepo.AddAsync(q1);
        await queueRepo.AddAsync(q2);
        await queueRepo.AddAsync(q3);

        await vitalsRepo.AddAsync(new PatientVitals
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueItemId = q1.Id,
            PatientId = p1.Id,
            RecordedByNurseName = "Nurse Clara",
            RecordedAt = visitDay.AddHours(8).AddMinutes(5),
            SystolicBp = 120,
            DiastolicBp = 80,
            RosCategory = RosSystem.Respiratory
        });
        await vitalsRepo.AddAsync(new PatientVitals
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueItemId = q2.Id,
            PatientId = p2.Id,
            RecordedByNurseName = "Nurse Clara",
            RecordedAt = visitDay.AddHours(9).AddMinutes(5),
            SystolicBp = 110,
            DiastolicBp = 70,
            Notes = "Mild hypogastric cramping",
            HomeInstructions = "Warm compress and hydration",
            RosCategory = RosSystem.Genitourinary
        });

        var c1 = new ConsultationEncounter
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueItemId = q1.Id,
            PatientId = p1.Id,
            PatientName = "Dela Cruz, Miguel",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Ana Cruz",
            EncounterDate = visitDay.AddHours(8).AddMinutes(15),
            Assessment = "Acute Bronchitis",
            RosCategory = RosSystem.Respiratory,
            IsSigned = true,
            SignedAt = visitDay.AddHours(8).AddMinutes(35),
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    TenantId = TenantId,
                    ClinicId = _clinicId,
                    GenericName = "Salbutamol + Guaifenesin",
                    Dosage = "2mg/100mg",
                    Form = "Capsule",
                    Sig = "1 cap TID",
                    Quantity = 15,
                    IsClinicDispensed = true,
                    ClinicDispensedQuantity = 3,
                    RosCategory = RosSystem.Respiratory
                }
            }
        };
        var c3 = new ConsultationEncounter
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueItemId = q3.Id,
            PatientId = p3.Id,
            PatientName = "Lim, Paolo",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Ana Cruz",
            EncounterDate = visitDay.AddHours(10).AddMinutes(10),
            Assessment = "Essentially Normal Physical Examination",
            RosCategory = RosSystem.EssentiallyNormal,
            IsSigned = true,
            SignedAt = visitDay.AddHours(10).AddMinutes(20)
        };
        await consultRepo.AddAsync(c1);
        await consultRepo.AddAsync(c3);

        await dispensingRepo.AddAsync(new ClinicDispensingLog
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = p1.Id,
            PatientName = "Dela Cruz, Miguel",
            QueueItemId = q1.Id,
            ConsultationEncounterId = c1.Id,
            Source = ClinicDispenseSource.DoctorConsultation,
            ItemName = "Salbutamol + Guaifenesin",
            ItemCategory = ClinicDispenseItemCategory.Medicine,
            DosageOrSpec = "2mg/100mg",
            FormOrUnit = "Capsule",
            QuantityDispensed = 3,
            DirectionsOrInstructions = "1 cap TID",
            RosCategory = RosSystem.Respiratory,
            IsConsultationValidated = true,
            DispensedByStaffName = "Dr. Ana Cruz",
            DispensedByRole = "Doctor",
            DispensedAt = visitDay.AddHours(8).AddMinutes(35)
        });
        await dispensingRepo.AddAsync(new ClinicDispensingLog
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = p2.Id,
            PatientName = "Reyes, Hannah",
            QueueItemId = q2.Id,
            Source = ClinicDispenseSource.NurseVitalsCheck,
            ItemName = "Mefenamic Acid",
            ItemCategory = ClinicDispenseItemCategory.Medicine,
            DosageOrSpec = "250mg",
            FormOrUnit = "Capsule",
            QuantityDispensed = 2,
            DirectionsOrInstructions = "Take 1 cap after meals PRN pain",
            RosCategory = RosSystem.Genitourinary,
            IsConsultationValidated = true,
            DispensedByStaffName = "Nurse Clara",
            DispensedByRole = "Nurse",
            DispensedAt = visitDay.AddHours(9).AddMinutes(10),
            RequiresDoctorReview = true
        });

        await medCertRepo.AddAsync(new MedicalCertificate
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            CertificateNumber = "MC-20261110-0001",
            PatientId = p1.Id,
            PatientName = "Dela Cruz, Miguel",
            ConsultationId = c1.Id,
            QueueItemId = q1.Id,
            DoctorId = c1.DoctorId,
            DoctorName = "Dr. Ana Cruz",
            PrcLicenseNumber = "0123456",
            IssueDate = DateOnly.FromDateTime(visitDay),
            Diagnosis = "Acute Bronchitis",
            IsSigned = true
        });
        await referralRepo.AddAsync(new ReferralLetter
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ReferralNumber = "REF-20261110-0001",
            PatientId = p1.Id,
            PatientName = "Dela Cruz, Miguel",
            ConsultationId = c1.Id,
            QueueItemId = q1.Id,
            ReferringDoctorId = c1.DoctorId,
            ReferringDoctorName = "Dr. Ana Cruz",
            ReferredToFacility = "University Chest Clinic",
            ReferredDepartment = "Pulmonology",
            ReferralDate = DateOnly.FromDateTime(visitDay),
            ReasonForReferral = "Spirometry",
            ProvisionalDiagnosis = "Acute Bronchitis",
            ClinicalSummary = "Wheezing resolved",
            IsSigned = true
        });
        await labOrderRepo.AddAsync(new LabOrder
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            OrderNumber = "LAB-20261110-0001",
            PatientId = p1.Id,
            PatientName = "Dela Cruz, Miguel",
            ConsultationId = c1.Id,
            QueueItemId = q1.Id,
            OrderDate = visitDay.AddHours(8).AddMinutes(30),
            IsSigned = true
        });

        await uow.SaveChangesAsync();

        var censusHandler = new GetClinicCensusReportQueryHandler(
            queueRepo, patientRepo, vitalsRepo, consultRepo, procRepo, invoiceRepo, _clinicContext,
            settingsRepo, dispensingRepo, medCertRepo, referralRepo, labOrderRepo);

        var report = await censusHandler.Handle(new GetClinicCensusReportQuery(visitDay, visitDay), CancellationToken.None);

        // Strictly ONE row per patient visit (3 visits = 3 census rows)
        report.Items.Should().HaveCount(3);
        report.Summary.VisitsWithMedicineDispensing.Should().Be(2);
        report.Summary.TotalDispensedLineItems.Should().Be(2);
        report.Summary.TotalDispensedUnits.Should().Be(5);
        report.Summary.PrescriptionsIssued.Should().Be(1);
        report.Summary.MedicalCertificatesIssued.Should().Be(1);
        report.Summary.ReferralsIssued.Should().Be(1);
        report.Summary.LabRequisitionsIssued.Should().Be(1);

        var row1 = report.Items.Single(i => i.QueueNumber == "C-001");
        row1.ServicesAvailed.Should().NotContain("Vitals Check", "vitals are already part of the Consultation package");
        row1.ServicesAvailedSummary.Should().Be("Routine Checkup + Medicine Dispensing + Prescription + Medical Certificate + Referral + Laboratory Requisition");
        row1.RosCategory.Should().Be("Respiratory");
        row1.DispensedMedicinesSummary.Should().Contain("Salbutamol + Guaifenesin");

        var row2 = report.Items.Single(i => i.QueueNumber == "V-002");
        row2.ServicesAvailedSummary.Should().Be("Preventive Health Assessment + Medicine Dispensing");
        row2.RosCategory.Should().Be("Genitourinary");
        row2.NurseAssessment.Should().Contain("Home Care: Warm compress and hydration");

        var row3 = report.Items.Single(i => i.QueueNumber == "C-003");
        row3.ServicesAvailedSummary.Should().Be("Routine Checkup");
        row3.RosCategory.Should().Be("Essentially Normal");
        row3.SystemsReviewed.Should().Contain("Essentially Normal");

        // Unified Dispensing Ledger in Census Report
        report.DispensingLedger.Should().NotBeNull();
        report.DispensingLedger!.Should().HaveCount(2);

        // Verify Excel export generates 3 tabs (including Dispensing Ledger), merges parent visit columns,
        // emits dedicated sub-rows for additional services with providing staff, and leaves non-diagnosis cells blank
        row1.ServiceRows.Should().NotBeNull();
        row1.ServiceRows!.Select(sr => sr.ServiceName).Should().Equal(
            "Medicine Dispensing",
            "Prescription",
            "Medical Certificate",
            "Referral",
            "Laboratory Requisition");
        row1.ServiceRows.Should().OnlyContain(sr => string.IsNullOrEmpty(sr.DoctorDiagnosis));
        row2.DoctorDiagnosis.Should().BeEmpty();
        row2.ServiceRows.Should().ContainSingle(sr => sr.ServiceName == "Medicine Dispensing" && string.IsNullOrEmpty(sr.DoctorDiagnosis));

        var settings = new FacilitySettings { TenantId = TenantId, ClinicId = _clinicId, ClinicName = "University Health Services" };
        var excelBytes = new ClinicCensusExcelService().GenerateClinicCensusExcel(report, settings);
        using var ms = new MemoryStream(excelBytes);
        using var wb = new XLWorkbook(ms);
        wb.Worksheets.Count.Should().Be(3);
        wb.Worksheets.Should().Contain(w => w.Name == "Dispensing Ledger");
        var wsReg = wb.Worksheet("Census Register");
        wsReg.Cell(7, 13).GetString().Should().Be("Routine Checkup");
        wsReg.Cell(8, 13).GetString().Should().Contain("↳ Medicine Dispensing");
        wsReg.Cell(8, 19).GetString().Should().BeEmpty();
        wsReg.Cell(9, 13).GetString().Should().Contain("↳ Prescription");
        wsReg.Cell(10, 13).GetString().Should().Contain("↳ Medical Certificate (MC-20261110-0001)");
        wsReg.Cell(11, 13).GetString().Should().Contain("↳ Referral (REF-20261110-0001)");
        wsReg.Cell(12, 13).GetString().Should().Contain("↳ Laboratory Requisition (LAB-20261110-0001)");
        wsReg.Cell(13, 13).GetString().Should().Be("Preventive Health Assessment");
        wsReg.Cell(13, 19).GetString().Should().BeEmpty();
        wsReg.Cell(14, 13).GetString().Should().Contain("↳ Medicine Dispensing");

        var pdfBytes = new ClinicDocumentPdfService().GenerateClinicCensusReportPdf(report, settings, "Nurse Clara");
        Encoding.ASCII.GetString(pdfBytes, 0, 5).Should().Be("%PDF-");
    }

    [Fact]
    public async Task AbandonConsultation_RejectsAlreadySignedEncounter()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);

        var signedEncounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Santos, Maria",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Ana Cruz",
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        await consultRepo.AddAsync(signedEncounter);
        await uow.SaveChangesAsync();

        var handler = new AbandonConsultationCommandHandler(consultRepo, queueRepo, uow, _clinicContext);
        await FluentActions.Invoking(() => handler.Handle(
                new AbandonConsultationCommand(signedEncounter.Id, "Try to delete signed note"),
                CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Signed*cannot be abandoned*");
    }

    [Fact]
    public async Task DirectConsultationSignOff_WithoutQueueTicket_SavesCleanly_AndMaterializesCensusVisitRows()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(db, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(db, sieve);
        var invRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var dispensingRepo = TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<LabOrder>(db, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);

        var visitDay = DateTime.UtcNow.Date;
        var patient1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-DIR-01",
            FirstName = "Paolo",
            LastName = "Gomez",
            ContactNumber = "+639171111111",
            DateOfBirth = new DateOnly(2002, 5, 10),
            Sex = BiologicalSex.Male
        };
        var patient2 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-DIR-02",
            FirstName = "Bea",
            LastName = "Lim",
            ContactNumber = "+639172222222",
            DateOfBirth = new DateOnly(2003, 9, 15),
            Sex = BiologicalSex.Female
        };
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Marco",
            LastName = "Tan",
            Email = "marco.tan@clinic.test",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0888888",
            PtrNumber = "PTR-888888"
        };
        await patientRepo.AddAsync(patient1);
        await patientRepo.AddAsync(patient2);
        await staffRepo.AddAsync(doctor);
        await uow.SaveChangesAsync();

        _clinicContext.StaffId.Returns(doctor.Id);
        _clinicContext.StaffRole.Returns("Doctor");
        _clinicContext.StaffName.Returns("Dr. Marco Tan");

        var createHandler = new CreateConsultationCommandHandler(consultRepo, queueRepo, uow, _clinicContext, staffRepo);

        // Direct consultation #1 (no QueueItemId) WITH clinic-dispensed starter tablets
        var directWithDispense = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient1.Id,
            PatientName: "Gomez, Paolo",
            DoctorId: doctor.Id,
            DoctorName: "Dr. Marco Tan",
            QueueItemId: null,
            AppointmentId: null,
            Subjective: "Acute pharyngitis",
            Objective: "Tonsillar erythema",
            Assessment: "Acute Pharyngitis",
            Plan: "Starter analgesic + warm saline gargle",
            HomeInstructions: "Hydrate well",
            Diagnoses: new List<DiagnosisInput> { new("J02.9", "Acute pharyngitis", true) },
            Prescriptions: new List<PrescriptionInput>
            {
                new("Paracetamol", "Biogesic", "500mg", "Tablet", "1 tab q6h PRN", 10, ClinicDispensedQuantity: 2)
            },
            RosCategory: "Heent"), CancellationToken.None);

        // Direct consultation #2 (no QueueItemId) WITHOUT clinic dispensing (prescription only)
        var directRxOnly = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient2.Id,
            PatientName: "Lim, Bea",
            DoctorId: doctor.Id,
            DoctorName: "Dr. Marco Tan",
            QueueItemId: null,
            AppointmentId: null,
            Subjective: "Allergic rhinitis",
            Objective: "Pale nasal turbinates",
            Assessment: "Allergic Rhinitis",
            Plan: "Antihistamine once daily",
            HomeInstructions: "Avoid dust triggers",
            Diagnoses: new List<DiagnosisInput> { new("J30.4", "Allergic rhinitis", true) },
            Prescriptions: new List<PrescriptionInput>
            {
                new("Loratadine", null, "10mg", "Tablet", "1 tab OD", 10, ClinicDispensedQuantity: 0)
            },
            RosCategory: "Heent"), CancellationToken.None);

        var config = new ConfigurationBuilder().Build();
        var identity = Phase3TestKit.Identity(_clinicId, TenantId);
        var claims = Phase3TestKit.Claims();
        var docPublisher = Phase3TestKit.Documents(db);

        var signHandler = new SignConsultationCommandHandler(
            consultRepo,
            staffRepo,
            queueRepo,
            apptRepo,
            patientRepo,
            uow,
            _clinicContext,
            identity,
            Substitute.For<IPatientAppointmentPublisher>(),
            Substitute.For<IPrescriptionPublisher>(),
            claims,
            docPublisher,
            null,
            config,
            null,
            dispensingRepo,
            medCertRepo,
            referralRepo,
            labOrderRepo);

        // Must NOT throw DbUpdateConcurrencyException on newly materialized DIR-* QueueItem!
        var signed1 = await signHandler.Handle(new SignConsultationCommand(directWithDispense.Id, PrcLicenseNumber: "0888888"), CancellationToken.None);
        var signed2 = await signHandler.Handle(new SignConsultationCommand(directRxOnly.Id, PrcLicenseNumber: "0888888"), CancellationToken.None);

        signed1.QueueItemId.Should().NotBeNull();
        signed2.QueueItemId.Should().NotBeNull();

        var census = await new GetClinicCensusReportQueryHandler(
            queueRepo, patientRepo, vitalsRepo, consultRepo, procRepo, invRepo, _clinicContext, null,
            dispensingRepo, medCertRepo, referralRepo, labOrderRepo)
            .Handle(new GetClinicCensusReportQuery(visitDay, visitDay), CancellationToken.None);

        census.Items.Should().HaveCount(2, "both signed direct consultations must materialize a visit row in Clinic Census");
        census.Items.Single(i => i.PatientCode == "PAT-DIR-01").ServicesAvailedSummary
            .Should().Be("Routine Checkup + Medicine Dispensing + Prescription");
        census.Items.Single(i => i.PatientCode == "PAT-DIR-02").ServicesAvailedSummary
            .Should().Be("Routine Checkup + Prescription");
    }

    [Fact]
    public async Task GetPatientChartQuery_PreservesRosAndDispensingFields_AndHidesUnsignedConsultationArtifactsUntilSigned()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(db, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(db, sieve);
        var invRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var dispensingRepo = TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<LabOrder>(db, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-CHART-01",
            FirstName = "Katrina",
            LastName = "Vega",
            ContactNumber = "+639173333333",
            DateOfBirth = new DateOnly(2001, 4, 20),
            Sex = BiologicalSex.Female
        };
        var doctor = Phase3TestKit.NewDoctor(_clinicId, TenantId);
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-701",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = patient.Id,
            PatientName = "Vega, Katrina",
            VisitType = VisitType.RoutineCheckup,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };
        await patientRepo.AddAsync(patient);
        await staffRepo.AddAsync(doctor);
        await queueRepo.AddAsync(queue);
        await uow.SaveChangesAsync();

        var triageHandler = new RecordTriageVitalsCommandHandler(
            queueRepo, vitalsRepo, patientRepo, uow, _clinicContext, null, dispensingRepo);
        await triageHandler.Handle(new RecordTriageVitalsCommand(
            QueueItemId: queue.Id,
            NurseId: Guid.NewGuid(),
            RecordedByNurseName: "Nurse Joy",
            SystolicBp: 118,
            DiastolicBp: 76,
            HeartRateBpm: 74,
            TemperatureCelsius: 36.8m,
            RespiratoryRateBreathsPerMin: 16,
            OxygenSaturationPercent: 99m,
            HeightCm: 160m,
            WeightKg: 54m,
            PainScore: 2,
            Notes: "Mild cough",
            ChiefComplaint: "Dry cough",
            HomeInstructions: "Warm fluids and rest",
            RosCategory: "Respiratory",
            DispensedItems: new List<TriageDispensedItemInput>
            {
                new("Lagundi Leaf", "Medicine", "600mg", "Tablet", 2, "Take 1 tab BID", "Respiratory")
            }), CancellationToken.None);

        _clinicContext.StaffId.Returns(doctor.Id);
        _clinicContext.StaffRole.Returns("Doctor");

        var createConsult = new CreateConsultationCommandHandler(consultRepo, queueRepo, uow, _clinicContext, staffRepo);
        var draft = await createConsult.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: "Vega, Katrina",
            DoctorId: doctor.Id,
            DoctorName: "Dr. Ana Cruz",
            QueueItemId: queue.Id,
            AppointmentId: null,
            Subjective: "Dry cough x 2 days",
            Objective: "Clear breath sounds",
            Assessment: "Acute Bronchitis",
            Plan: "Mucolytic + rest",
            HomeInstructions: "Increase oral fluids",
            Diagnoses: new List<DiagnosisInput> { new("J20.9", "Acute bronchitis", true) },
            Prescriptions: new List<PrescriptionInput>
            {
                new("Ambroxol", null, "30mg", "Tablet", "1 tab TID", 15, ClinicDispensedQuantity: 3, RosCategory: "Respiratory")
            },
            RosCategory: "Respiratory"), CancellationToken.None);

        var identity = Phase3TestKit.Identity(_clinicId, TenantId);
        var docPublisher = Phase3TestKit.Documents(db);
        var security = new DocumentSecurityService();
        var config = new ConfigurationBuilder().Build();
        var uploadGrants = Phase3TestKit.Grants(db);
        var claims = Phase3TestKit.Claims();
        var labPublisher = Substitute.For<ILabRequisitionPublisher>();

        await new IssueMedicalCertificateCommandHandler(
            medCertRepo, uow, _clinicContext, identity, docPublisher, security, config, consultRepo, queueRepo)
            .Handle(new IssueMedicalCertificateCommand(
                PatientId: patient.Id,
                PatientName: "Vega, Katrina",
                ConsultationId: draft.Id,
                DoctorId: doctor.Id,
                DoctorName: "Dr. Ana Cruz",
                PrcLicenseNumber: "0123456",
                PtrNumber: "PTR-001",
                Diagnosis: "Acute Bronchitis",
                ClinicalFindings: "Mild cough",
                RecommendedRestDays: 1,
                QueueItemId: queue.Id), CancellationToken.None);

        await new IssueReferralLetterCommandHandler(
            referralRepo, uow, _clinicContext, security, staffRepo, consultRepo, queueRepo)
            .Handle(new IssueReferralLetterCommand(
                PatientId: patient.Id,
                PatientName: "Vega, Katrina",
                ConsultationId: draft.Id,
                ReferringDoctorId: doctor.Id,
                ReferringDoctorName: "Dr. Ana Cruz",
                ReferredToDoctor: "Dr. Pulmo",
                ReferredToFacility: "Pulmo Clinic",
                ReferredDepartment: "Pulmonology",
                Urgency: "Routine",
                ReasonForReferral: "Persistent cough",
                ProvisionalDiagnosis: "Acute Bronchitis",
                ClinicalSummary: "Stable vitals",
                QueueItemId: queue.Id), CancellationToken.None);

        await new CreateClinicLabOrderCommandHandler(
            labOrderRepo, patientRepo, staffRepo, uow, _clinicContext, identity,
            labPublisher, uploadGrants, claims, docPublisher, null, consultRepo, queueRepo)
            .Handle(new CreateClinicLabOrderCommand(
                PatientId: patient.Id,
                PatientName: "Vega, Katrina",
                ConsultationId: draft.Id,
                OrderedByDoctorId: doctor.Id,
                OrderedByDoctorName: "Dr. Ana Cruz",
                ClinicalDiagnosis: "Acute Bronchitis",
                Items: new List<CreateLabOrderItemRequest> { new("Chest X-Ray PA", "Imaging", null) },
                QueueItemId: queue.Id), CancellationToken.None);

        var chartHandler = new GetPatientChartQueryHandler(
            consultRepo, vitalsRepo, procRepo, labOrderRepo, invRepo, _clinicContext,
            patientRepo: patientRepo, medCertRepo: medCertRepo, referralRepo: referralRepo,
            dispensingLogRepo: dispensingRepo, queueRepo: queueRepo);

        var unsignedChart = await chartHandler.Handle(new GetPatientChartQuery(patient.Id), CancellationToken.None);
        var draftById = await new ClinicEz.Clinic.Application.Features.Consultations.Queries.GetConsultationByIdQueryHandler(consultRepo, _clinicContext)
            .Handle(new ClinicEz.Clinic.Application.Features.Consultations.Queries.GetConsultationByIdQuery(draft.Id), CancellationToken.None);

        // Draft encounter rehydrates RosCategory + staged ClinicDispensedQuantity via GetConsultationByIdQuery, while official Patient Chart hides unsigned drafts
        draftById.IsSigned.Should().BeFalse();
        draftById.RosCategory.Should().Be("Respiratory");
        draftById.RosCategoryLabel.Should().Be("Respiratory");
        draftById.Prescriptions[0].ClinicDispensedQuantity.Should().Be(3);
        draftById.Prescriptions[0].IsClinicDispensed.Should().BeFalse();
        unsignedChart.Consultations.Should().BeEmpty();

        // Nurse vitals retain HomeInstructions, RosCategory, ChiefComplaint, and DispensedItems
        unsignedChart.VitalsHistory.Should().ContainSingle();
        unsignedChart.VitalsHistory[0].HomeInstructions.Should().Be("Warm fluids and rest");
        unsignedChart.VitalsHistory[0].RosCategory.Should().Be("Respiratory");
        unsignedChart.VitalsHistory[0].ChiefComplaint.Should().Be("Dry cough");
        unsignedChart.VitalsHistory[0].DispensedItems.Should().ContainSingle(d => d.ItemName == "Lagundi Leaf");

        // Unsigned consultation-staged LabOrder, MedCert, and Referral are hidden from official Patient Chart
        unsignedChart.LabOrdersHistory.Should().BeEmpty();
        unsignedChart.MedicalCertificates.Should().BeEmpty();
        unsignedChart.ReferralLetters.Should().BeEmpty();

        // Now sign the consultation and re-query Patient Chart
        var signHandler = new SignConsultationCommandHandler(
            consultRepo, staffRepo, queueRepo, apptRepo, patientRepo, uow, _clinicContext, identity,
            Substitute.For<IPatientAppointmentPublisher>(), Substitute.For<IPrescriptionPublisher>(), claims,
            docPublisher, null, config, null, dispensingRepo, medCertRepo, referralRepo, labOrderRepo,
            uploadGrants, labPublisher, security);
        await signHandler.Handle(new SignConsultationCommand(draft.Id, PrcLicenseNumber: "0123456"), CancellationToken.None);

        var signedChart = await chartHandler.Handle(new GetPatientChartQuery(patient.Id), CancellationToken.None);
        signedChart.Consultations[0].IsSigned.Should().BeTrue();
        signedChart.Consultations[0].Prescriptions[0].IsClinicDispensed.Should().BeTrue();
        signedChart.LabOrdersHistory.Should().ContainSingle();
        signedChart.MedicalCertificates.Should().ContainSingle();
        signedChart.ReferralLetters.Should().ContainSingle();
    }

    [Fact]
    public async Task SignOffEnforcement_CompleteQueueBlocksUnsigned_WhileRevertPurgesUnpaidDraftInvoices_AndCancelPurgesUnreviewedNurseLogs()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var diagRepo = TestDbHelper.CreateRepository<EncounterDiagnosis>(db, sieve);
        var rxRepo = TestDbHelper.CreateRepository<PrescriptionItem>(db, sieve);
        var invRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var invLineRepo = TestDbHelper.CreateRepository<InvoiceLineItem>(db, sieve);
        var dispensingRepo = TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-REV-01",
            FirstName = "Noel",
            LastName = "Ramos",
            ContactNumber = "+639174444444",
            DateOfBirth = new DateOnly(1998, 2, 14),
            Sex = BiologicalSex.Male
        };
        var consultQueue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueNumber = "C-801",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = patient.Id,
            PatientName = "Ramos, Noel",
            VisitType = VisitType.RoutineCheckup,
            Status = QueueStatus.InConsultation,
            CheckInTime = DateTime.UtcNow
        };
        await patientRepo.AddAsync(patient);
        await queueRepo.AddAsync(consultQueue);

        var unsignedConsult = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueItemId = consultQueue.Id,
            PatientId = patient.Id,
            PatientName = "Ramos, Noel",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Elena Cruz",
            IsSigned = false
        };
        await consultRepo.AddAsync(unsignedConsult);

        var draftInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            InvoiceNumber = "INV-DRAFT-801",
            PatientId = patient.Id,
            PatientName = "Ramos, Noel",
            QueueItemId = consultQueue.Id,
            ConsultationId = unsignedConsult.Id,
            GrossAmount = 500m,
            NetAmount = 500m,
            BalanceDue = 500m,
            AmountPaid = 0m,
            Status = InvoiceStatus.Draft,
            LineItems = new List<InvoiceLineItem>
            {
                new() { TenantId = TenantId, ClinicId = _clinicId, Description = "Consultation Fee", Category = "Consultation", UnitPrice = 500m, Quantity = 1, TotalPrice = 500m }
            }
        };
        await invRepo.AddAsync(draftInvoice);
        await uow.SaveChangesAsync();

        // 1. CompleteQueueItemCommand MUST block completing a Consultation visit with an unsigned encounter
        var completeQueueHandler = new CompleteQueueItemCommandHandler(
            queueRepo, uow, _clinicContext, null, consultRepo);
        await FluentActions.Invoking(() => completeQueueHandler.Handle(new CompleteQueueItemCommand(consultQueue.Id), CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>()
            .WithMessage("*pending physician sign-off*");

        // 2. CompleteNonDoctorVisitCommand on stepped-out consultation visit purges unsigned consultation + unpaid Draft invoice
        var nonDoctorComplete = new CompleteNonDoctorVisitCommandHandler(
            queueRepo, uow, _clinicContext, null,
            consultationRepository: consultRepo,
            diagnosisRepository: diagRepo,
            prescriptionRepository: rxRepo,
            dispensingLogRepository: dispensingRepo,
            invoiceRepository: invRepo,
            invoiceLineItemRepository: invLineRepo);
        await nonDoctorComplete.Handle(new CompleteNonDoctorVisitCommand(consultQueue.Id, "Patient stepped out before MD sign-off"), CancellationToken.None);

        (await db.Consultations.IgnoreQueryFilters().CountAsync(c => c.Id == unsignedConsult.Id)).Should().Be(0);
        (await db.Invoices.IgnoreQueryFilters().CountAsync(i => i.Id == draftInvoice.Id)).Should().Be(0);

        // 3. Explicit CancelQueueTicketCommand purges unreviewed NurseVitalsCheck OTC logs so cancelled tickets don't pollute ledger
        var vitalsQueue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueNumber = "V-802",
            SequenceNumber = 2,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = patient.Id,
            PatientName = "Ramos, Noel",
            VisitType = VisitType.PreventiveHealthAssessment,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };
        await queueRepo.AddAsync(vitalsQueue);
        await uow.SaveChangesAsync();

        var triageHandler = new RecordTriageVitalsCommandHandler(
            queueRepo, vitalsRepo, patientRepo, uow, _clinicContext, null, dispensingRepo);
        await triageHandler.Handle(new RecordTriageVitalsCommand(
            QueueItemId: vitalsQueue.Id,
            NurseId: Guid.NewGuid(),
            RecordedByNurseName: "Nurse Clara",
            SystolicBp: 120,
            DiastolicBp: 80,
            HeartRateBpm: 72,
            TemperatureCelsius: 36.7m,
            RespiratoryRateBreathsPerMin: 16,
            OxygenSaturationPercent: 99m,
            HeightCm: 170m,
            WeightKg: 68m,
            PainScore: 3,
            Notes: "Mild headache",
            ChiefComplaint: "Headache",
            HomeInstructions: "Rest",
            RosCategory: "Neurological",
            DispensedItems: new List<TriageDispensedItemInput>
            {
                new("Paracetamol", "Medicine", "500mg", "Tablet", 2, "PRN", "Neurological")
            }), CancellationToken.None);

        (await db.ClinicDispensingLogs.CountAsync(d => d.QueueItemId == vitalsQueue.Id)).Should().Be(1);

        var cancelHandler = new CancelQueueTicketCommandHandler(
            queueRepo, uow, _clinicContext, null, dispensingLogRepository: dispensingRepo);
        await cancelHandler.Handle(new CancelQueueTicketCommand(vitalsQueue.Id, "Wrong patient checked in"), CancellationToken.None);

        (await db.ClinicDispensingLogs.IgnoreQueryFilters().CountAsync(d => d.QueueItemId == vitalsQueue.Id)).Should().Be(0);
    }

    [Fact]
    public async Task CensusReport_RepeatSameDayVisitsForSamePatient_DoesNotDoubleCountUnlinkedArtifacts()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(db, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(db, sieve);
        var invRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var dispensingRepo = TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<LabOrder>(db, sieve);

        var visitDay = new DateTime(2026, 11, 11, 0, 0, 0, DateTimeKind.Utc);
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-REPEAT-01",
            FirstName = "Carlo",
            LastName = "Mendoza",
            ContactNumber = "+639175555555",
            DateOfBirth = new DateOnly(2000, 1, 15),
            Sex = BiologicalSex.Male
        };
        var morningVisit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueNumber = "C-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(visitDay),
            PatientId = patient.Id,
            PatientName = "Mendoza, Carlo",
            VisitType = VisitType.RoutineCheckup,
            Status = QueueStatus.Completed,
            CheckInTime = visitDay.AddHours(9),
            CompletedTime = visitDay.AddHours(9).AddMinutes(20)
        };
        var afternoonVisit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueNumber = "C-002",
            SequenceNumber = 2,
            QueueDate = DateOnly.FromDateTime(visitDay),
            PatientId = patient.Id,
            PatientName = "Mendoza, Carlo",
            VisitType = VisitType.RoutineCheckup,
            Status = QueueStatus.Completed,
            CheckInTime = visitDay.AddHours(15),
            CompletedTime = visitDay.AddHours(15).AddMinutes(25)
        };
        var unlinkedMedCert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            CertificateNumber = "MC-20261111-0099",
            PatientId = patient.Id,
            PatientName = "Mendoza, Carlo",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Cruz",
            PrcLicenseNumber = "0123456",
            IssueDate = DateOnly.FromDateTime(visitDay),
            Diagnosis = "Tension Headache",
            IsSigned = true,
            SignedAt = visitDay.AddHours(15).AddMinutes(10),
            CreatedAt = visitDay.AddHours(15).AddMinutes(10)
        };
        var unlinkedLab = new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            OrderNumber = "LAB-20261111-0099",
            PatientId = patient.Id,
            PatientName = "Mendoza, Carlo",
            OrderDate = visitDay.AddHours(9).AddMinutes(10),
            IsSigned = true
        };

        await patientRepo.AddAsync(patient);
        await queueRepo.AddAsync(morningVisit);
        await queueRepo.AddAsync(afternoonVisit);
        await medCertRepo.AddAsync(unlinkedMedCert);
        await labOrderRepo.AddAsync(unlinkedLab);
        await uow.SaveChangesAsync();

        var report = await new GetClinicCensusReportQueryHandler(
            queueRepo, patientRepo, vitalsRepo, consultRepo, procRepo, invRepo, _clinicContext, null,
            dispensingRepo, medCertRepo, referralRepo, labOrderRepo)
            .Handle(new GetClinicCensusReportQuery(visitDay, visitDay), CancellationToken.None);

        report.Items.Should().HaveCount(2);
        report.Summary.MedicalCertificatesIssued.Should().Be(1, "unlinked same-day medical certificate must not be double-counted across repeat visits");
        report.Summary.LabRequisitionsIssued.Should().Be(1, "unlinked same-day lab order must not be double-counted across repeat visits");

        // Morning lab order attaches to morning visit; afternoon med cert attaches to afternoon visit
        report.Items.Single(i => i.QueueNumber == "C-001").LabRequisitionsCount.Should().Be(1);
        report.Items.Single(i => i.QueueNumber == "C-001").MedicalCertificatesCount.Should().Be(0);
        report.Items.Single(i => i.QueueNumber == "C-002").MedicalCertificatesCount.Should().Be(1);
        report.Items.Single(i => i.QueueNumber == "C-002").LabRequisitionsCount.Should().Be(0);
    }

    [Fact]
    public async Task EodReport_Analytics_Search_AndExternalDispense_ExcludeUnsignedRxAndUnsignedLabOrders()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(db, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(db, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(db, sieve);

        var today = DateTime.UtcNow.Date.AddHours(10);
        var unsignedEncounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Unsigned Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Cruz",
            EncounterDate = today,
            IsSigned = false,
            RxPublicVerificationToken = "unsigned-token-001",
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    GenericName = "Diazepam",
                    Dosage = "5mg",
                    Form = "Tablet",
                    Sig = "1 tab HS",
                    Quantity = 10,
                    IsDangerousDrug = true
                }
            }
        };
        var unsignedLabOrder = new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            OrderNumber = "LAB-UNSIGNED-001",
            PatientId = unsignedEncounter.PatientId,
            PatientName = "Unsigned Patient",
            ConsultationId = unsignedEncounter.Id,
            OrderDate = today,
            IsSigned = false,
            Items = new List<LabOrderItem>
            {
                new() { TestName = "Complete Blood Count", Category = "Hematology" }
            }
        };

        await consultRepo.AddAsync(unsignedEncounter);
        await labRepo.AddAsync(unsignedLabOrder);
        await uow.SaveChangesAsync();

        // 1. Both RecordExternalDispenseCommand and SubmitPublicRxDispenseCommand reject unsigned draft encounters
        var extDispenseHandler = new RecordExternalDispenseCommandHandler(consultRepo, uow, Substitute.For<ISender>());
        await FluentActions.Invoking(() => extDispenseHandler.Handle(
                new RecordExternalDispenseCommand(unsignedEncounter.Id, "Mercury Drug", "Makati", "RPh Santos", "001122", "OR-1", null, null),
                CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>()
            .WithMessage("*unsigned*");

        var publicDispenseHandler = new SubmitPublicRxDispenseCommandHandler(consultRepo, uow, Substitute.For<ISender>());
        await FluentActions.Invoking(() => publicDispenseHandler.Handle(
                new SubmitPublicRxDispenseCommand("unsigned-token-001", "Watsons", "Makati", "RPh Lim", "009988", "OR-2", null, null),
                CancellationToken.None))
            .Should().ThrowAsync<BadRequestException>()
            .WithMessage("*not been signed*");

        // 2. Daily EOD Report excludes unsigned prescriptions and unsigned lab orders
        var eod = await new GetDailyEodReportQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext)
            .Handle(new GetDailyEodReportQuery(today.Date), CancellationToken.None);
        eod.TotalPrescriptionsWritten.Should().Be(0);
        eod.TotalDangerousDrugPrescriptions.Should().Be(0);
        eod.TotalLabOrdersIssued.Should().Be(0);

        // 3. Clinic Analytics excludes unsigned lab orders from TopServices
        var analytics = await new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext)
            .Handle(new GetClinicAnalyticsQuery(today.Date, today.Date), CancellationToken.None);
        analytics.TopServices.Should().NotContain(s => s.ItemType == "LabOrder");

        // 4. Global LabOrderSearchProvider excludes unsigned consultation lab orders
        var searchResults = await new LabOrderSearchProvider(labRepo)
            .SearchAsync("LAB-UNSIGNED-001", _clinicId, 10, CancellationToken.None);
        searchResults.Should().BeEmpty();
    }

    [Fact]
    public async Task StandaloneDirectChartOrder_StaysSignedImmediately_AndSoftDeletingUnsignedDocuments_EmitsZeroRevokedOutboxEvents()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<LabOrder>(db, sieve);

        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId, syncPatientId: Guid.NewGuid());
        var doctor = Phase3TestKit.NewDoctor(_clinicId, TenantId);
        var directChartQueue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueNumber = "DV-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = patient.Id,
            PatientName = "Santos, Maria",
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            Status = QueueStatus.Completed,
            CheckInTime = DateTime.UtcNow
        };
        await patientRepo.AddAsync(patient);
        await staffRepo.AddAsync(doctor);
        await queueRepo.AddAsync(directChartQueue);
        await uow.SaveChangesAsync();

        var identity = Phase3TestKit.Identity(_clinicId, TenantId);
        var docPublisher = Phase3TestKit.Documents(db);
        var uploadGrants = Phase3TestKit.Grants(db);
        var claims = Phase3TestKit.Claims();
        var labPublisher = Substitute.For<ILabRequisitionPublisher>();

        // 1. Standalone direct order from PatientChartModal (IsDirectVisit == true, no ConsultationEncounter) stays IsSigned = true!
        var labHandler = new CreateClinicLabOrderCommandHandler(
            labOrderRepo, patientRepo, staffRepo, uow, _clinicContext, identity,
            labPublisher, uploadGrants, claims, docPublisher, null, consultRepo, queueRepo);
        var directLab = await labHandler.Handle(new CreateClinicLabOrderCommand(
            PatientId: patient.Id,
            PatientName: "Santos, Maria",
            ConsultationId: null,
            OrderedByDoctorId: doctor.Id,
            OrderedByDoctorName: "Dr. Ana Cruz",
            ClinicalDiagnosis: "Routine annual labs",
            Items: new List<CreateLabOrderItemRequest> { new("Lipid Profile", "Chemistry", null) },
            QueueItemId: directChartQueue.Id), CancellationToken.None);

        directLab.IsSigned.Should().BeTrue("standalone direct chart orders without a consultation encounter must remain immediately valid");
        directLab.PublicUploadUrl.Should().NotBeNullOrWhiteSpace();

        // 2. Soft-deleting unsigned MedicalCertificate, ReferralLetter, ConsultationEncounter, and LabOrder emits ZERO REVOKED outbox events
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();
        var interceptor = new ClinicEz.Clinic.Infrastructure.Persistence.Interceptors.ClinicPortalProjectionInterceptor(new DocumentSecurityService());
        var options = new DbContextOptionsBuilder<ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext>()
            .UseInMemoryDatabase($"UnsignedSoftDelete_{Guid.NewGuid():N}")
            .AddInterceptors(interceptor)
            .Options;

        await using var outboxDb = new ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext(options, config, _clinicContext);
        var unsignedCert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            CertificateNumber = "MC-UNSIGNED-01",
            PatientId = patient.Id,
            PatientName = "Santos, Maria",
            DoctorId = doctor.Id,
            DoctorName = "Dr. Ana Cruz",
            PrcLicenseNumber = "0123456",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Diagnosis = "Draft",
            IsSigned = false
        };
        var unsignedRef = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            ReferralNumber = "REF-UNSIGNED-01",
            PatientId = patient.Id,
            PatientName = "Santos, Maria",
            ReferringDoctorId = doctor.Id,
            ReferringDoctorName = "Dr. Ana Cruz",
            ReferredToFacility = "General Hospital",
            ReferredDepartment = "Internal Medicine",
            ReasonForReferral = "Draft",
            ProvisionalDiagnosis = "Draft",
            ClinicalSummary = "Draft",
            IsSigned = false
        };
        var unsignedLab = new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            OrderNumber = "LAB-UNSIGNED-02",
            PatientId = patient.Id,
            PatientName = "Santos, Maria",
            IsSigned = false
        };

        outboxDb.MedicalCertificates.Add(unsignedCert);
        outboxDb.ReferralLetters.Add(unsignedRef);
        outboxDb.LabOrders.Add(unsignedLab);
        await outboxDb.SaveChangesAsync();

        (await outboxDb.InteropOutbox.CountAsync()).Should().Be(0);

        // Soft-delete all unsigned artifacts -> must NOT emit spurious REVOKED attestation outbox events
        unsignedCert.IsDeleted = true;
        unsignedRef.IsDeleted = true;
        unsignedLab.IsDeleted = true;
        await outboxDb.SaveChangesAsync();

        (await outboxDb.InteropOutbox.CountAsync()).Should().Be(0, "soft-deleting unsigned clinical artifacts must never publish REVOKED outbox events");
    }

    // =================================================================================================
    // ROUND 2 HARDENING: RELATIONAL SQLITE FOREIGN-KEY ENFORCEMENT, RX SLIP PARTIAL DISPENSE & CENSUS PDF PARITY
    // =================================================================================================

    private async Task<(Microsoft.Data.Sqlite.SqliteConnection Connection, ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext Db, ClinicEz.Clinic.Infrastructure.Persistence.UnitOfWork Uow, Sieve.Services.ISieveProcessor Sieve)> CreateRelationalSqliteTestContextAsync()
    {
        var connection = new Microsoft.Data.Sqlite.SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();

        await using (var pragmaCmd = connection.CreateCommand())
        {
            pragmaCmd.CommandText = "PRAGMA foreign_keys = ON;";
            await pragmaCmd.ExecuteNonQueryAsync();
        }

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var softDeleteInterceptor = new ClinicEz.Clinic.Infrastructure.Persistence.Interceptors.SoftDeleteSaveChangesInterceptor();
        var portalProjectionInterceptor = new ClinicEz.Clinic.Infrastructure.Persistence.Interceptors.ClinicPortalProjectionInterceptor();
        var domainEventInterceptor = new ClinicEz.Clinic.Infrastructure.Persistence.Interceptors.DomainEventDispatchSaveChangesInterceptor(Substitute.For<IServiceProvider>());
        var options = new DbContextOptionsBuilder<ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext>()
            .UseSqlite(connection)
            .AddInterceptors(softDeleteInterceptor, portalProjectionInterceptor, domainEventInterceptor)
            .Options;

        var db = new ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext(options, config, _clinicContext);
        await db.Database.EnsureCreatedAsync();

        // Confirm SQLite relational foreign-key enforcement is genuinely active on this connection
        await using (var verifyCmd = connection.CreateCommand())
        {
            verifyCmd.CommandText = "PRAGMA foreign_keys;";
            var fkEnabled = Convert.ToInt64(await verifyCmd.ExecuteScalarAsync());
            fkEnabled.Should().Be(1L, "SQLite PRAGMA foreign_keys must be enabled so Restrict/NoAction FKs match PostgreSQL 17");
        }

        var sieve = Substitute.For<Sieve.Services.ISieveProcessor>();
        var productRepo = Substitute.For<IProductRepository>();
        var uow = new ClinicEz.Clinic.Infrastructure.Persistence.UnitOfWork(db, sieve, productRepo);
        return (connection, db, uow, sieve);
    }

    private async Task<(Patient Patient, StaffMember Doctor, QueueItem Queue, PatientVitals Vitals, TeleconsultRecordingSession Recording, ClinicDispensingLog ReviewedNurseDispense, ConsultationEncounter Encounter)> SeedFullRelationalUnsignedGraphAsync(
        ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext db,
        DateOnly queueDate)
    {
        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        patient.FirstName = "Elena";
        patient.LastName = "Reyes";
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Marco",
            LastName = "Villanueva",
            Email = "marco@clinic.test",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0099112",
            IsActive = true
        };

        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Reyes, Elena",
            QueueNumber = $"Q-FK-{Guid.NewGuid().ToString("N")[..4]}",
            SequenceNumber = 1,
            QueueDate = queueDate,
            VisitType = VisitType.RoutineCheckup,
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Triaged,
            CheckInTime = DateTime.UtcNow.AddMinutes(-30),
            DoctorId = doctor.Id,
            DoctorName = "Dr. Marco Villanueva"
        };

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueItemId = queue.Id,
            PatientId = patient.Id,
            PatientName = queue.PatientName,
            DoctorId = doctor.Id,
            DoctorName = "Dr. Marco Villanueva",
            EncounterDate = DateTime.UtcNow.AddMinutes(-15),
            Subjective = "Cough and fever",
            Assessment = "Draft URI",
            IsSigned = false
        };

        var vitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueItemId = queue.Id,
            ConsultationEncounterId = encounter.Id,
            PatientId = patient.Id,
            RecordedByNurseName = "Nurse Joy, RN",
            SystolicBp = 118,
            DiastolicBp = 76,
            HeartRateBpm = 82,
            TemperatureCelsius = 37.8m,
            RosCategory = RosSystem.Respiratory
        };

        var recording = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            CallId = Guid.NewGuid(),
            ConsultationId = encounter.Id,
            PatientId = patient.Id,
            PatientName = queue.PatientName,
            DoctorId = doctor.Id,
            DoctorName = "Dr. Marco Villanueva",
            ConsentStatus = "Consented",
            RecordingState = "Completed",
            IsLegalHold = true,
            LegalHoldReason = "Medico-legal retention"
        };

        var adolescent = new EncounterAdolescentAssessment
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            ConsultationEncounterId = encounter.Id,
            SmrAssessed = true,
            Remarks = "Draft SMR"
        };

        var headsss = new EncounterHeadsssDomainAssessment
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            ConsultationEncounterId = encounter.Id,
            Domain = HeadsssDomain.Home,
            PatientAnswers = "Lives with parents"
        };

        var obGyne = new EncounterObGyneExam
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            ConsultationEncounterId = encounter.Id,
            FundicHeightCm = 24m
        };

        var milestone = new EncounterPediatricMilestone
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            ConsultationEncounterId = encounter.Id,
            MilestoneVisitAgeCode = "12M",
            IsOverallDevelopmentAtPar = true
        };

        var dangerSign = new EncounterPediatricDangerSign
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PediatricMilestoneId = milestone.Id,
            Domain = PediatricDevelopmentDomain.GrossMotor,
            DangerSignCode = "DS-01",
            Description = "Draft danger sign"
        };

        var activeRos = new EncounterReviewOfSystemsItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            ConsultationEncounterId = encounter.Id,
            System = RosSystem.Respiratory,
            IsNormal = false,
            SymptomTitle = "Productive cough"
        };

        // Soft-deleted ROS row to verify IgnoreQueryFilters() prevents 23503 on physical parent delete!
        var softDeletedRos = new EncounterReviewOfSystemsItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            ConsultationEncounterId = encounter.Id,
            System = RosSystem.Neurological,
            IsNormal = true,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow.AddMinutes(-5)
        };

        var bpLog = new PatientBpMonitoringLog
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            ConsultationEncounterId = encounter.Id,
            StartDate = queueDate.AddDays(-6),
            EndDate = queueDate
        };

        var bpDay = new PatientBpMonitoringDay
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            BpMonitoringLogId = bpLog.Id,
            DayNumber = 1,
            MeasurementDate = queueDate,
            AmSystolic = 122,
            AmDiastolic = 80
        };

        var yakap = new YakapSubmission
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            ConsultationEncounterId = encounter.Id,
            AccreditationNo = "P12345678",
            CaseNo = "CASE-DRAFT-01",
            LocalTransactionNo = "E-DRAFT-001",
            SubmissionType = YakapSubmissionType.Fpe,
            ProcessingStatus = YakapProcessingStatus.Queued
        };

        var yakapError = new YakapSubmissionError
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            YakapSubmissionId = yakap.Id,
            FieldPath = "soap.atc",
            Issue = "Missing ATC"
        };

        var pe = new PatientPhysicalExam
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            ConsultationEncounterId = encounter.Id,
            ChestLungsRemarks = "Clear breath sounds"
        };

        var peFinding = new PatientPhysicalExamFinding
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PhysicalExamId = pe.Id,
            System = PhysicalExamSystem.Chest,
            IsNormal = true,
            FindingTitle = "Normal chest"
        };

        var diag = new EncounterDiagnosis
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            ConsultationEncounterId = encounter.Id,
            Icd10Code = "J06.9",
            Description = "Acute URI",
            IsPrimary = true
        };

        var rxItem = new PrescriptionItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            ConsultationEncounterId = encounter.Id,
            GenericName = "Paracetamol",
            Dosage = "500mg",
            Form = "Tablet",
            Sig = "1 tab q6h PRN",
            Quantity = 10,
            IsClinicDispensed = true,
            ClinicDispensedQuantity = 2
        };

        var docDispense = new ClinicDispensingLog
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = queue.PatientName,
            QueueItemId = queue.Id,
            ConsultationEncounterId = encounter.Id,
            PrescriptionItemId = rxItem.Id,
            Source = ClinicDispenseSource.DoctorConsultation,
            ItemCategory = ClinicDispenseItemCategory.Medicine,
            ItemName = "Paracetamol",
            DosageOrSpec = "500mg",
            FormOrUnit = "Tablet",
            QuantityDispensed = 2,
            RosCategory = RosSystem.Respiratory,
            DispensedByStaffId = doctor.Id,
            DispensedByStaffName = "Dr. Marco Villanueva",
            DispensedByRole = "Doctor",
            IsConsultationValidated = false
        };

        var reviewedNurseDispense = new ClinicDispensingLog
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = queue.PatientName,
            QueueItemId = queue.Id,
            PatientVitalsId = vitals.Id,
            Source = ClinicDispenseSource.NurseVitalsCheck,
            ItemCategory = ClinicDispenseItemCategory.MedicalSupply,
            ItemName = "Surgical Mask",
            FormOrUnit = "Piece",
            QuantityDispensed = 1,
            RosCategory = RosSystem.Respiratory,
            DispensedByStaffId = Guid.NewGuid(),
            DispensedByStaffName = "Nurse Joy, RN",
            DispensedByRole = "Nurse",
            RequiresDoctorReview = true,
            ReviewedByDoctorId = doctor.Id,
            ReviewedByDoctorName = "Dr. Marco Villanueva",
            ReviewedAt = DateTime.UtcNow.AddMinutes(-10),
            IsConsultationValidated = true
        };

        var labOrder = new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            OrderNumber = $"LAB-FK-{Guid.NewGuid().ToString("N")[..5]}",
            PatientId = patient.Id,
            PatientName = queue.PatientName,
            QueueItemId = queue.Id,
            ConsultationId = encounter.Id,
            OrderedByDoctorId = doctor.Id,
            OrderedByDoctorName = "Dr. Marco Villanueva",
            IsSigned = false
        };

        var labItem = new LabOrderItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            LabOrderId = labOrder.Id,
            TestName = "CBC with Platelet",
            Category = "Hematology"
        };

        var labObs = new LabObservation
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            LabOrderId = labOrder.Id,
            LabOrderItemId = labItem.Id,
            AnalyteCode = "WBC",
            AnalyteName = "White Blood Cell Count",
            ValueText = "8.4"
        };

        var labResult = new LabResult
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            LabOrderId = labOrder.Id,
            FileName = "draft-cbc.pdf"
        };

        var uploadGrant = new UploadGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            LabOrderId = labOrder.Id,
            TokenHash = new byte[32],
            ExpiresAt = DateTime.UtcNow.AddHours(24)
        };

        var medCert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            CertificateNumber = $"MC-FK-{Guid.NewGuid().ToString("N")[..5]}",
            PatientId = patient.Id,
            PatientName = queue.PatientName,
            QueueItemId = queue.Id,
            ConsultationId = encounter.Id,
            DoctorId = doctor.Id,
            DoctorName = "Dr. Marco Villanueva",
            PrcLicenseNumber = "0099112",
            IssueDate = queueDate,
            Diagnosis = "Draft URI",
            IsSigned = false
        };

        var referral = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            ReferralNumber = $"REF-FK-{Guid.NewGuid().ToString("N")[..5]}",
            PatientId = patient.Id,
            PatientName = queue.PatientName,
            QueueItemId = queue.Id,
            ConsultationId = encounter.Id,
            ReferringDoctorId = doctor.Id,
            ReferringDoctorName = "Dr. Marco Villanueva",
            ReferredToFacility = "Regional Medical Center",
            ReferredDepartment = "Pulmonology",
            ReasonForReferral = "Further evaluation",
            ProvisionalDiagnosis = "Draft URI",
            ClinicalSummary = "Draft summary",
            IsSigned = false
        };

        var draftInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            InvoiceNumber = $"INV-FK-{Guid.NewGuid().ToString("N")[..5]}",
            PatientId = patient.Id,
            PatientName = queue.PatientName,
            QueueItemId = queue.Id,
            ConsultationId = encounter.Id,
            Status = InvoiceStatus.Draft,
            GrossAmount = 500m,
            NetAmount = 500m,
            BalanceDue = 500m,
            AmountPaid = 0m
        };

        var draftInvoiceLine = new InvoiceLineItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            InvoiceId = draftInvoice.Id,
            Description = "Consultation Fee",
            Category = "Consultation",
            Quantity = 1,
            UnitPrice = 500m,
            TotalPrice = 500m
        };

        db.Patients.Add(patient);
        db.StaffMembers.Add(doctor);
        db.QueueItems.Add(queue);
        db.Consultations.Add(encounter);
        db.PatientVitals.Add(vitals);
        db.TeleconsultRecordingSessions.Add(recording);
        db.EncounterAdolescentAssessments.Add(adolescent);
        db.EncounterHeadsssDomainAssessments.Add(headsss);
        db.EncounterObGyneExams.Add(obGyne);
        db.EncounterPediatricMilestones.Add(milestone);
        db.EncounterPediatricDangerSigns.Add(dangerSign);
        db.EncounterReviewOfSystemsItems.AddRange(activeRos, softDeletedRos);
        db.PatientBpMonitoringLogs.Add(bpLog);
        db.PatientBpMonitoringDays.Add(bpDay);
        db.YakapSubmissions.Add(yakap);
        db.YakapSubmissionErrors.Add(yakapError);
        db.PatientPhysicalExams.Add(pe);
        db.PatientPhysicalExamFindings.Add(peFinding);
        db.Set<EncounterDiagnosis>().Add(diag);
        db.Prescriptions.Add(rxItem);
        db.ClinicDispensingLogs.AddRange(docDispense, reviewedNurseDispense);
        db.LabOrders.Add(labOrder);
        db.LabOrderItems.Add(labItem);
        db.LabObservations.Add(labObs);
        db.LabResults.Add(labResult);
        db.UploadGrants.Add(uploadGrant);
        db.MedicalCertificates.Add(medCert);
        db.ReferralLetters.Add(referral);
        db.Invoices.Add(draftInvoice);
        db.InvoiceLineItems.Add(draftInvoiceLine);

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        return (patient, doctor, queue, vitals, recording, reviewedNurseDispense, encounter);
    }

    [Fact]
    public async Task RelationalSqliteForeignKeys_AbandonConsultation_WithAllRestrictAndNoActionDependents_PurgesCleanly_AndPreservesTriageVitals()
    {
        var (conn, db, uow, sieve) = await CreateRelationalSqliteTestContextAsync();
        await using var _ = conn;
        await using var __ = db;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var seeded = await SeedFullRelationalUnsignedGraphAsync(db, today);

        // Sanity proof: raw SQL DELETE of Consultations fails with SQLite FK constraint violation before revert helper runs
        await using (var rawDeleteCmd = conn.CreateCommand())
        {
            rawDeleteCmd.CommandText = "DELETE FROM Consultations WHERE Id = $id;";
            rawDeleteCmd.Parameters.AddWithValue("$id", seeded.Encounter.Id);
            var rawAct = async () => await rawDeleteCmd.ExecuteNonQueryAsync();
            await rawAct.Should().ThrowAsync<Microsoft.Data.Sqlite.SqliteException>()
                .WithMessage("*FOREIGN KEY constraint failed*");
        }

        // Construct AbandonConsultationCommandHandler with ONLY minimal 4 required args (zero optional repos!)
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var abandonHandler = new AbandonConsultationCommandHandler(consultRepo, queueRepo, uow, _clinicContext);

        var result = await abandonHandler.Handle(
            new AbandonConsultationCommand(seeded.Encounter.Id, Reason: "Patient left before MD sign-off", CancelVisit: false),
            CancellationToken.None);

        result.Should().BeTrue();

        // Verify zero physical rows remain for all unsigned encounter artifacts & Restrict dependents (including soft-deleted ROS row!)
        (await db.Consultations.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.EncounterAdolescentAssessments.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.EncounterHeadsssDomainAssessments.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.EncounterObGyneExams.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.EncounterPediatricMilestones.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.EncounterPediatricDangerSigns.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.EncounterReviewOfSystemsItems.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.PatientBpMonitoringLogs.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.PatientBpMonitoringDays.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.YakapSubmissions.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.YakapSubmissionErrors.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.PatientPhysicalExams.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.PatientPhysicalExamFindings.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.Set<EncounterDiagnosis>().IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.Prescriptions.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.LabOrders.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.LabOrderItems.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.LabObservations.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.LabResults.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.UploadGrants.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.MedicalCertificates.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.ReferralLetters.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.Invoices.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.InvoiceLineItems.IgnoreQueryFilters().CountAsync()).Should().Be(0);

        // CRITICAL: Triage PatientVitals MUST survive intact with ConsultationEncounterId unlinked to null!
        var survivingVitals = await db.PatientVitals.IgnoreQueryFilters().SingleAsync();
        survivingVitals.Id.Should().Be(seeded.Vitals.Id);
        survivingVitals.IsDeleted.Should().BeFalse();
        survivingVitals.ConsultationEncounterId.Should().BeNull();
        survivingVitals.SystolicBp.Should().Be(118);
        survivingVitals.DiastolicBp.Should().Be(76);

        // Medico-legal TeleconsultRecordingSession MUST survive intact with ConsultationId unlinked to null!
        var survivingSession = await db.TeleconsultRecordingSessions.IgnoreQueryFilters().SingleAsync();
        survivingSession.Id.Should().Be(seeded.Recording.Id);
        survivingSession.IsDeleted.Should().BeFalse();
        survivingSession.IsLegalHold.Should().BeTrue();
        survivingSession.ConsultationId.Should().BeNull();

        // DoctorConsultation dispensing log purged; reviewed NurseVitalsCheck dispensing log preserved!
        var survivingDispenses = await db.ClinicDispensingLogs.IgnoreQueryFilters().ToListAsync();
        survivingDispenses.Should().ContainSingle(d => d.Id == seeded.ReviewedNurseDispense.Id && !d.IsDeleted);
    }

    [Theory]
    [InlineData("Cancel")]
    [InlineData("NoShow")]
    [InlineData("CompleteNonDoctor")]
    [InlineData("Divert")]
    [InlineData("ReconcileEod")]
    public async Task RelationalSqliteForeignKeys_AllFiveQueueRevertCommands_WithMinimalConstructorArgs_RevertAllRestrictDependentsWithoutFkViolation(string callerMode)
    {
        var (conn, db, uow, sieve) = await CreateRelationalSqliteTestContextAsync();
        await using var _ = conn;
        await using var __ = db;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var seeded = await SeedFullRelationalUnsignedGraphAsync(db, today);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);

        switch (callerMode)
        {
            case "Cancel":
            {
                var handler = new CancelQueueTicketCommandHandler(queueRepo, uow, _clinicContext);
                await handler.Handle(new CancelQueueTicketCommand(seeded.Queue.Id), CancellationToken.None);
                break;
            }
            case "NoShow":
            {
                var handler = new MarkQueueItemNoShowCommandHandler(queueRepo, uow, _clinicContext);
                await handler.Handle(new MarkQueueItemNoShowCommand(seeded.Queue.Id), CancellationToken.None);
                break;
            }
            case "CompleteNonDoctor":
            {
                var handler = new CompleteNonDoctorVisitCommandHandler(queueRepo, uow, _clinicContext);
                await handler.Handle(new CompleteNonDoctorVisitCommand(seeded.Queue.Id, "Discharged at triage"), CancellationToken.None);
                break;
            }
            case "Divert":
            {
                var handler = new DivertEmergencyPatientCommandHandler(queueRepo, uow, _clinicContext);
                await handler.Handle(new DivertEmergencyPatientCommand(
                    seeded.Queue.Id,
                    DestinationHospital: "Tertiary Hospital",
                    TransportMode: "Ambulance",
                    ParamedicOrEscortName: "EMT Santos",
                    ClinicalHandoverSummary: "Transferred for higher level care"), CancellationToken.None);
                break;
            }
            case "ReconcileEod":
            {
                var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(db, sieve);
                var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);
                var eodRes = await handler.Handle(new ReconcileEodCommand(Date: today, TriggerType: "Manual"), CancellationToken.None);
                eodRes.ReconciledCount.Should().Be(1);
                break;
            }
            default:
                throw new ArgumentOutOfRangeException(nameof(callerMode));
        }

        (await db.Consultations.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.EncounterAdolescentAssessments.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.EncounterHeadsssDomainAssessments.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.EncounterObGyneExams.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.EncounterPediatricMilestones.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.EncounterPediatricDangerSigns.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.EncounterReviewOfSystemsItems.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.PatientBpMonitoringLogs.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.PatientBpMonitoringDays.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.YakapSubmissions.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.YakapSubmissionErrors.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.LabOrders.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.LabOrderItems.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.LabObservations.IgnoreQueryFilters().CountAsync()).Should().Be(0);
        (await db.LabResults.IgnoreQueryFilters().CountAsync()).Should().Be(0);

        var survivingVitals = await db.PatientVitals.IgnoreQueryFilters().SingleAsync();
        survivingVitals.IsDeleted.Should().BeFalse();
        survivingVitals.ConsultationEncounterId.Should().BeNull();
    }

    [Fact]
    public void EfModelForeignKeyCompletenessGuard_EveryForeignKeyToConsultationsLabOrdersLabOrderItemsAndPrescriptionItems_IsAccountedFor()
    {
        var (db, _, _) = TestDbHelper.CreateTestContext(_clinicContext);

        var expectedConsultationDependents = new HashSet<Type>
        {
            typeof(ClinicDispensingLog),
            typeof(EncounterAdolescentAssessment),
            typeof(EncounterDiagnosis),
            typeof(EncounterHeadsssDomainAssessment),
            typeof(EncounterObGyneExam),
            typeof(EncounterPediatricMilestone),
            typeof(EncounterReviewOfSystemsItem),
            typeof(PatientBpMonitoringLog),
            typeof(PatientMedicalHistory),
            typeof(PatientPhysicalExam),
            typeof(PatientVitals),
            typeof(PrescriptionItem),
            typeof(TeleconsultRecordingSession),
            typeof(YakapSubmission)
        };

        var actualConsultationDependents = db.Model.GetEntityTypes()
            .SelectMany(e => e.GetForeignKeys())
            .Where(fk => fk.PrincipalEntityType.ClrType == typeof(ConsultationEncounter))
            .Select(fk => fk.DeclaringEntityType.ClrType)
            .ToHashSet();

        actualConsultationDependents.Should().BeEquivalentTo(expectedConsultationDependents,
            "any new FK pointing to Consultations must be explicitly handled in ConsultationRevertHelper to prevent PostgreSQL 23503 errors");

        var expectedLabOrderAndItemDependents = new HashSet<Type>
        {
            typeof(LabOrderItem),
            typeof(LabObservation),
            typeof(LabResult),
            typeof(UploadGrant)
        };

        var actualLabOrderAndItemDependents = db.Model.GetEntityTypes()
            .SelectMany(e => e.GetForeignKeys())
            .Where(fk => fk.PrincipalEntityType.ClrType == typeof(LabOrder) || fk.PrincipalEntityType.ClrType == typeof(LabOrderItem))
            .Select(fk => fk.DeclaringEntityType.ClrType)
            .ToHashSet();

        actualLabOrderAndItemDependents.Should().BeEquivalentTo(expectedLabOrderAndItemDependents,
            "any new FK pointing to LabOrders or LabOrderItems must be explicitly handled in ConsultationRevertHelper");
    }

    [Fact]
    public async Task PrescriptionSlipPdf_DisplaysClinicDispensedAndRemainingExternalPurchaseQuantities_ForPartialFullAndStandardItems()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var dispRepo = TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);

        var apptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        patient.FirstName = "Liza";
        patient.LastName = "Soberano";
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Rafael",
            LastName = "Mendoza",
            Email = "rafael@clinic.test",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0077889",
            PtrNumber = "PTR-2026-101",
            IsActive = true
        };
        var settings = new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "St. Raphael Family Clinic"
        };
        await patientRepo.AddAsync(patient);
        await staffRepo.AddAsync(doctor);
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var createHandler = new CreateConsultationCommandHandler(consultRepo, queueRepo, uow, _clinicContext, staffRepo);
        var consultDto = await createHandler.Handle(new CreateConsultationCommand(
            PatientId: patient.Id,
            PatientName: "Soberano, Liza",
            DoctorId: doctor.Id,
            DoctorName: "Dr. Rafael Mendoza",
            Assessment: "Acute Bacterial Sinusitis",
            Prescriptions: new List<PrescriptionInput>
            {
                new("Co-Amoxiclav", "Augmentin", "625mg", "Tablet", "1 tab BID x 5 days", Quantity: 10, DurationDays: 5, ClinicDispensedQuantity: 2),
                new("Paracetamol", "Biogesic", "500mg", "Tablet", "1 tab q6h PRN fever", Quantity: 6, DurationDays: 2, ClinicDispensedQuantity: 6),
                new("Cetirizine", "Virlix", "10mg", "Tablet", "1 tab OD HS x 14 days", Quantity: 14, DurationDays: 14)
            }), CancellationToken.None);

        var identity = Phase3TestKit.Identity(_clinicId, TenantId);
        var claims = Phase3TestKit.Claims();
        var docPublisher = Phase3TestKit.Documents(db);
        var config = new ConfigurationBuilder().Build();
        var signHandler = new SignConsultationCommandHandler(
            consultRepo,
            staffRepo,
            queueRepo,
            apptRepo,
            patientRepo,
            uow,
            _clinicContext,
            identity,
            Substitute.For<IPatientAppointmentPublisher>(),
            Substitute.For<IPrescriptionPublisher>(),
            claims,
            docPublisher,
            null,
            config,
            null,
            dispRepo);

        await signHandler.Handle(new SignConsultationCommand(consultDto.Id, PrcLicenseNumber: "0077889"), CancellationToken.None);

        var slipHandler = new GetPrescriptionSlipQueryHandler(consultRepo, patientRepo, staffRepo, settingsRepo, uow);
        var slip = await slipHandler.Handle(new GetPrescriptionSlipQuery(consultDto.Id), CancellationToken.None);

        slip.Items.Should().HaveCount(3);
        slip.Items[0].IsClinicDispensed.Should().BeTrue();
        slip.Items[0].ClinicDispensedQuantity.Should().Be(2);
        slip.Items[1].IsClinicDispensed.Should().BeTrue();
        slip.Items[1].ClinicDispensedQuantity.Should().Be(6);
        slip.Items[2].IsClinicDispensed.Should().BeFalse();

        var pdfService = new ClinicDocumentPdfService();
        var pdfBytes = pdfService.GeneratePrescriptionPdf(slip, settings);
        var pdfText = DecodeQuestPdfText(pdfBytes);

        pdfText.Should().Contain("Quantity: #10");
        pdfText.Should().Contain("Dispensed in Clinic: 2");
        pdfText.Should().Contain("Remaining for External Purchase: 8");

        pdfText.Should().Contain("Quantity: #6");
        pdfText.Should().Contain("Dispensed in Clinic: 6");
        pdfText.Should().Contain("Remaining for External Purchase: 0");

        pdfText.Should().Contain("Quantity: #14");
        pdfText.Should().NotContain("Quantity: #14 (Dispensed in Clinic");
    }

    [Fact]
    public async Task CensusReportParity_QueryExcelAndPdf_AllIncludeEightServiceBreakdownsAndRosBreakdown()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(db, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var dispRepo = TestDbHelper.CreateRepository<ClinicDispensingLog>(db, sieve);
        var medCertRepo = TestDbHelper.CreateRepository<MedicalCertificate>(db, sieve);
        var referralRepo = TestDbHelper.CreateRepository<ReferralLetter>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<LabOrder>(db, sieve);

        var today = DateTime.UtcNow.Date;
        var p1 = Phase3TestKit.NewPatient(_clinicId, TenantId);
        p1.FirstName = "Carlos";
        p1.LastName = "Gomez";
        var p2 = Phase3TestKit.NewPatient(_clinicId, TenantId);
        p2.FirstName = "Nina";
        p2.LastName = "Torres";
        await patientRepo.AddAsync(p1);
        await patientRepo.AddAsync(p2);

        var q1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = p1.Id,
            PatientName = "Gomez, Carlos",
            QueueNumber = "C-101",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(today),
            VisitType = VisitType.RoutineCheckup,
            Priority = QueuePriority.Urgent,
            Status = QueueStatus.Completed,
            CheckInTime = today.AddHours(8),
            CompletedTime = today.AddHours(8).AddMinutes(35),
            DoctorName = "Dr. Marco Villanueva"
        };

        var q2 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = p2.Id,
            PatientName = "Torres, Nina",
            QueueNumber = "V-102",
            SequenceNumber = 2,
            QueueDate = DateOnly.FromDateTime(today),
            VisitType = VisitType.PreventiveHealthAssessment,
            Priority = QueuePriority.Routine,
            Status = QueueStatus.DischargedNonDoctor,
            CheckInTime = today.AddHours(9),
            CompletedTime = today.AddHours(9).AddMinutes(15)
        };
        await queueRepo.AddAsync(q1);
        await queueRepo.AddAsync(q2);

        var c1 = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueItemId = q1.Id,
            PatientId = p1.Id,
            PatientName = q1.PatientName,
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Marco Villanueva",
            EncounterDate = today.AddHours(8).AddMinutes(10),
            Assessment = "Acute Bronchitis",
            RosCategory = RosSystem.Respiratory,
            IsSigned = true,
            SignedAt = today.AddHours(8).AddMinutes(30),
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = TenantId,
                    ClinicId = _clinicId,
                    GenericName = "Salbutamol",
                    Dosage = "2mg",
                    Form = "Tablet",
                    Sig = "1 tab TID",
                    Quantity = 10,
                    IsClinicDispensed = true,
                    ClinicDispensedQuantity = 2
                }
            }
        };
        await consultRepo.AddAsync(c1);

        await vitalsRepo.AddAsync(new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueItemId = q1.Id,
            ConsultationEncounterId = c1.Id,
            PatientId = p1.Id,
            RecordedByNurseName = "Nurse Joy, RN",
            SystolicBp = 120,
            DiastolicBp = 80,
            RosCategory = RosSystem.Respiratory
        });

        var v2 = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueItemId = q2.Id,
            PatientId = p2.Id,
            RecordedByNurseName = "Nurse Joy, RN",
            SystolicBp = 110,
            DiastolicBp = 70,
            RosCategory = RosSystem.EssentiallyNormal
        };
        await vitalsRepo.AddAsync(v2);

        await dispRepo.AddAsync(new ClinicDispensingLog
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = p1.Id,
            PatientName = q1.PatientName,
            QueueItemId = q1.Id,
            ConsultationEncounterId = c1.Id,
            Source = ClinicDispenseSource.DoctorConsultation,
            ItemCategory = ClinicDispenseItemCategory.Medicine,
            ItemName = "Salbutamol",
            DosageOrSpec = "2mg",
            FormOrUnit = "Tablet",
            QuantityDispensed = 2,
            RosCategory = RosSystem.Respiratory,
            DispensedByStaffId = c1.DoctorId,
            DispensedByStaffName = c1.DoctorName,
            DispensedByRole = "Doctor",
            IsConsultationValidated = true,
            DispensedAt = today.AddHours(8).AddMinutes(30)
        });

        await dispRepo.AddAsync(new ClinicDispensingLog
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = p2.Id,
            PatientName = q2.PatientName,
            QueueItemId = q2.Id,
            PatientVitalsId = v2.Id,
            Source = ClinicDispenseSource.NurseVitalsCheck,
            ItemCategory = ClinicDispenseItemCategory.Medicine,
            ItemName = "Ascorbic Acid",
            DosageOrSpec = "500mg",
            FormOrUnit = "Tablet",
            QuantityDispensed = 1,
            RosCategory = RosSystem.EssentiallyNormal,
            DispensedByStaffId = Guid.NewGuid(),
            DispensedByStaffName = "Nurse Joy, RN",
            DispensedByRole = "Nurse",
            RequiresDoctorReview = true,
            IsConsultationValidated = true,
            DispensedAt = today.AddHours(9).AddMinutes(10)
        });

        await medCertRepo.AddAsync(new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            CertificateNumber = "MC-PARITY-01",
            PatientId = p1.Id,
            PatientName = q1.PatientName,
            QueueItemId = q1.Id,
            ConsultationId = c1.Id,
            DoctorId = c1.DoctorId,
            DoctorName = c1.DoctorName,
            PrcLicenseNumber = "0099112",
            IssueDate = DateOnly.FromDateTime(today),
            Diagnosis = "Acute Bronchitis",
            IsSigned = true,
            SignedAt = today.AddHours(8).AddMinutes(30)
        });

        await referralRepo.AddAsync(new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            ReferralNumber = "REF-PARITY-01",
            PatientId = p1.Id,
            PatientName = q1.PatientName,
            QueueItemId = q1.Id,
            ConsultationId = c1.Id,
            ReferringDoctorId = c1.DoctorId,
            ReferringDoctorName = c1.DoctorName,
            ReferredToFacility = "City Pulmonary Center",
            ReferredDepartment = "Pulmonology",
            ReasonForReferral = "Spirometry",
            ProvisionalDiagnosis = "Acute Bronchitis",
            ClinicalSummary = "Wheezing resolved post-nebulization",
            IsSigned = true,
            SignedAt = today.AddHours(8).AddMinutes(30)
        });

        await labOrderRepo.AddAsync(new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            OrderNumber = "LAB-PARITY-01",
            PatientId = p1.Id,
            PatientName = q1.PatientName,
            QueueItemId = q1.Id,
            ConsultationId = c1.Id,
            OrderDate = today.AddHours(8).AddMinutes(25),
            IsSigned = true
        });

        await procRepo.AddAsync(new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = p1.Id,
            PatientName = q1.PatientName,
            QueueItemId = q1.Id,
            ConsultationId = c1.Id,
            ProcedureName = "Salbutamol Nebulization",
            Category = "Respiratory Therapy",
            Status = ProcedureStatus.Completed,
            ScheduledAt = today.AddHours(8).AddMinutes(20)
        });

        var settings = new FacilitySettings
        {
            TenantId = TenantId,
            ClinicId = _clinicId,
            ClinicName = "Parity Primary Care Clinic"
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var queryHandler = new GetClinicCensusReportQueryHandler(
            queueRepo,
            patientRepo,
            vitalsRepo,
            consultRepo,
            procRepo,
            invoiceRepo,
            _clinicContext,
            settingsRepo,
            dispRepo,
            medCertRepo,
            referralRepo,
            labOrderRepo);

        var report = await queryHandler.Handle(
            new GetClinicCensusReportQuery(StartDate: today, EndDate: today),
            CancellationToken.None);

        // 1. Strict 1 row per patient visit invariant + 8-service & ROS breakdowns on DTO
        report.Items.Should().HaveCount(2);
        report.ServiceBreakdown.Should().NotBeNull();
        report.ServiceBreakdown!.Select(s => s.ServiceName).Should().Equal(
            "Consultation",
            "Vitals Check",
            "Medicine Dispensing",
            "Prescription",
            "Medical Certificate",
            "Referral",
            "Laboratory Requisition",
            "In-Clinic Procedure");
        report.ServiceBreakdown.Single(s => s.ServiceName == "Consultation").VisitCount.Should().Be(1);
        report.ServiceBreakdown.Single(s => s.ServiceName == "Vitals Check").VisitCount.Should().Be(1);
        report.ServiceBreakdown.Single(s => s.ServiceName == "Medicine Dispensing").VisitCount.Should().Be(2);
        report.ServiceBreakdown.Single(s => s.ServiceName == "Prescription").TotalVolume.Should().Be(1);
        report.ServiceBreakdown.Single(s => s.ServiceName == "Medical Certificate").TotalVolume.Should().Be(1);
        report.ServiceBreakdown.Single(s => s.ServiceName == "Referral").TotalVolume.Should().Be(1);
        report.ServiceBreakdown.Single(s => s.ServiceName == "Laboratory Requisition").TotalVolume.Should().Be(1);
        report.ServiceBreakdown.Single(s => s.ServiceName == "In-Clinic Procedure").VisitCount.Should().Be(1);

        report.RosBreakdown.Should().NotBeNull();
        report.RosBreakdown!.Select(r => r.RosCategory).Should().Contain(new[] { "Respiratory", "Essentially Normal" });

        // 2. Excel Sheet 2 Summary Parity
        var excelService = new ClinicCensusExcelService();
        var excelBytes = excelService.GenerateClinicCensusExcel(report, settings);
        using var excelStream = new MemoryStream(excelBytes);
        using var workbook = new XLWorkbook(excelStream);
        workbook.Worksheets.Count.Should().Be(3);
        var ws2 = workbook.Worksheet("Executive Summary & Statistics");
        var ws2AllText = string.Join("\n", Enumerable.Range(1, 90).Select(r => $"{ws2.Cell(r, 1).GetString()} | {ws2.Cell(r, 2).GetString()} | {ws2.Cell(r, 3).GetString()}"));
        ws2AllText.Should().Contain("5. MULTI-SERVICE AVAILMENT");
        ws2AllText.Should().Contain("Consultation | 1");
        ws2AllText.Should().Contain("Vitals Check | 1");
        ws2AllText.Should().Contain("Medicine Dispensing | 2");
        ws2AllText.Should().Contain("Prescription | 1");
        ws2AllText.Should().Contain("Medical Certificate | 1");
        ws2AllText.Should().Contain("Referral | 1");
        ws2AllText.Should().Contain("Laboratory Requisition | 1");
        ws2AllText.Should().Contain("In-Clinic Procedure | 1");
        ws2AllText.Should().Contain("6. REVIEW OF SYSTEMS (ROS) BREAKDOWN");
        ws2AllText.Should().Contain("Respiratory | 1");
        ws2AllText.Should().Contain("Essentially Normal | 1");

        // 3. PDF Summary Parity (decoded directly from QuestPDF vector text streams!)
        var pdfService = new ClinicDocumentPdfService();
        var pdfBytes = pdfService.GenerateClinicCensusReportPdf(report, settings, "Nurse Joy, RN");
        var pdfText = DecodeQuestPdfText(pdfBytes);

        pdfText.Should().Contain("MULTI-SERVICE AVAILMENT BREAKDOWN");
        pdfText.Should().Contain("Consultation: 1");
        pdfText.Should().Contain("Vitals Check: 1");
        pdfText.Should().Contain("Medicine Dispensing: 2 (2 items / 3 units)");
        pdfText.Should().Contain("Prescription: 1");
        pdfText.Should().Contain("Medical Certificate: 1");
        pdfText.Should().Contain("Referral: 1");
        pdfText.Should().Contain("Laboratory Requisition: 1");
        pdfText.Should().Contain("In-Clinic Procedure: 1");

        pdfText.Should().Contain("REVIEW OF SYSTEMS (ROS) BREAKDOWN");
        pdfText.Should().Contain("Essentially Normal: 1");
        pdfText.Should().Contain("Respiratory: 1");
        pdfText.Should().Contain("UNIFIED CLINIC MEDICINE & SUPPLY DISPENSING LEDGER");
    }

    [Fact]
    public async Task RelationalSqlite_DraftConsultationUpsert_ReSavesRosDiagnosesPrescriptionsAndPhysicalExam_WithoutRestrictFkViolationOrSoftDeletedOrphans()
    {
        var (conn, db, uow, sieve) = await CreateRelationalSqliteTestContextAsync();
        await using var _ = conn;
        await using var __ = db;

        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var patientFullName = $"{patient.LastName}, {patient.FirstName}";
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Elena",
            LastName = "Cruz",
            Email = "elena@clinic.test",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0102030",
            IsActive = true
        };
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientFullName,
            QueueNumber = "Q-DRF-01",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.RoutineCheckup,
            Priority = QueuePriority.Routine,
            Status = QueueStatus.InConsultation,
            CheckInTime = DateTime.UtcNow.AddMinutes(-20),
            DoctorId = doctor.Id,
            DoctorName = "Dr. Elena Cruz"
        };

        db.Patients.Add(patient);
        db.StaffMembers.Add(doctor);
        db.QueueItems.Add(queue);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var consultRepo = uow.GetRepository<ConsultationEncounter>();
        var queueRepo = uow.GetRepository<QueueItem>();
        var staffRepo = uow.GetRepository<StaffMember>();
        var diagRepo = uow.GetRepository<EncounterDiagnosis>();
        var rxRepo = uow.GetRepository<PrescriptionItem>();
        var appointmentRepo = uow.GetRepository<Appointment>();
        var patientRepo = uow.GetRepository<Patient>();

        var createHandler = new CreateConsultationCommandHandler(
            consultRepo,
            queueRepo,
            uow,
            _clinicContext,
            staffRepo);

        // 1. Guard: ClinicDispensedQuantity > Quantity must reject with BadRequestException
        var invalidCreateAct = async () => await createHandler.Handle(
            new CreateConsultationCommand(
                PatientId: patient.Id,
                PatientName: patientFullName,
                DoctorId: doctor.Id,
                DoctorName: "Dr. Elena Cruz",
                QueueItemId: queue.Id,
                Subjective: "Productive cough",
                Assessment: "Acute bronchitis",
                RosCategory: "Respiratory",
                Prescriptions: new List<PrescriptionInput>
                {
                    new("Amoxicillin", null, "500mg", "Capsule", "1 cap TID", Quantity: 2, ClinicDispensedQuantity: 4, RosCategory: "Respiratory")
                }),
            CancellationToken.None);
        await invalidCreateAct.Should().ThrowAsync<BadRequestException>();

        // 2. Initial draft save with ROS items, Diagnoses, PhysicalExam JSON, and Starter Rx (4 of 10)
        var initialDraft = await createHandler.Handle(
            new CreateConsultationCommand(
                PatientId: patient.Id,
                PatientName: patientFullName,
                DoctorId: doctor.Id,
                DoctorName: "Dr. Elena Cruz",
                QueueItemId: queue.Id,
                Subjective: "Productive cough",
                Assessment: "Acute bronchitis",
                RosCategory: "Respiratory",
                PhysicalExamFindingsJson: "{\"chestRemarks\":\"Rhonchi bilateral\"}",
                Diagnoses: new List<DiagnosisInput> { new("J20.9", "Acute bronchitis, unspecified", true) },
                Prescriptions: new List<PrescriptionInput>
                {
                    new("Amoxicillin", null, "500mg", "Capsule", "1 cap TID", Quantity: 10, ClinicDispensedQuantity: 4, RosCategory: "Respiratory")
                },
                ReviewOfSystemsItems: new List<ConsultationRosItemInput>
                {
                    new(System: "Respiratory", SymptomName: "Productive cough", IsPertinentPositive: true)
                }),
            CancellationToken.None);
        db.ChangeTracker.Clear();

        // 3. Second draft save on the SAME QueueItemId via CreateConsultationCommand (ensureDraftConsultationSaved + edit)
        var reSavedDraft = await createHandler.Handle(
            new CreateConsultationCommand(
                PatientId: patient.Id,
                PatientName: patientFullName,
                DoctorId: doctor.Id,
                DoctorName: "Dr. Elena Cruz",
                QueueItemId: queue.Id,
                Subjective: "Productive cough, improving",
                Assessment: "Acute URI",
                RosCategory: "Respiratory",
                PhysicalExamFindingsJson: "{\"chestRemarks\":\"Clear breath sounds\"}",
                Diagnoses: new List<DiagnosisInput> { new("J06.9", "Acute upper respiratory infection", true) },
                Prescriptions: new List<PrescriptionInput>
                {
                    new("Carbocisteine", null, "500mg", "Capsule", "1 cap TID", Quantity: 12, ClinicDispensedQuantity: 3, RosCategory: "Respiratory")
                },
                ReviewOfSystemsItems: new List<ConsultationRosItemInput>
                {
                    new(System: "Respiratory", SymptomName: "Mild cough", IsPertinentPositive: true),
                    new(System: "Heent", SymptomName: "Nasal congestion", IsPertinentPositive: true)
                }),
            CancellationToken.None);
        reSavedDraft.Id.Should().Be(initialDraft.Id);
        db.ChangeTracker.Clear();

        // 4. Third draft update via UpdateConsultationCommand with rosRepository omitted (falls back to IRepositoryProvider)
        var updateHandler = new UpdateConsultationCommandHandler(
            consultRepo,
            diagRepo,
            rxRepo,
            uow,
            _clinicContext,
            staffRepo,
            rosRepository: null);

        var updatedDraft = await updateHandler.Handle(
            new UpdateConsultationCommand(
                Id: initialDraft.Id,
                Subjective: "Mild cough x 2 days",
                Objective: "Afebrile, clear lungs",
                Assessment: "Acute URI",
                Plan: "Starter Carbocisteine + hydration",
                Diagnoses: new List<DiagnosisInput> { new("J06.9", "Acute URI", true) },
                Prescriptions: new List<PrescriptionInput>
                {
                    new("Carbocisteine", null, "500mg", "Capsule", "1 cap TID", Quantity: 6, ClinicDispensedQuantity: 2, RosCategory: "Respiratory")
                },
                RosCategory: "Respiratory",
                ReviewOfSystemsItems: new List<ConsultationRosItemInput>
                {
                    new(System: "Respiratory", SymptomName: "Mild cough", IsPertinentPositive: true)
                }),
            CancellationToken.None);
        db.ChangeTracker.Clear();

        // Verify relational SQLite tables (including IgnoreQueryFilters) have ZERO soft-deleted orphan draft rows and 1 PE
        var allRosRows = await db.EncounterReviewOfSystemsItems.IgnoreQueryFilters()
            .Where(r => r.ConsultationEncounterId == initialDraft.Id)
            .ToListAsync();
        allRosRows.Should().ContainSingle(r => !r.IsDeleted && r.System == RosSystem.Respiratory);

        var allDiagRows = await db.Set<EncounterDiagnosis>().IgnoreQueryFilters()
            .Where(d => d.ConsultationEncounterId == initialDraft.Id)
            .ToListAsync();
        allDiagRows.Should().ContainSingle(d => !d.IsDeleted && d.Icd10Code == "J06.9" && d.ClinicId == _clinicId && d.TenantId == TenantId);

        var allRxRows = await db.Prescriptions.IgnoreQueryFilters()
            .Where(p => p.ConsultationEncounterId == initialDraft.Id)
            .ToListAsync();
        allRxRows.Should().ContainSingle(p => !p.IsDeleted && p.GenericName == "Carbocisteine" && p.Quantity == 6 && p.ClinicDispensedQuantity == 2 && p.ClinicId == _clinicId);

        var allPeRows = await db.PatientPhysicalExams.IgnoreQueryFilters()
            .Where(pe => pe.ConsultationEncounterId == initialDraft.Id)
            .ToListAsync();
        allPeRows.Should().ContainSingle();

        // 5. Sign via SignConsultationCommand with dispensingLogRepository omitted (resolves via IRepositoryProvider)
        var identity = Substitute.For<IClinicIdentityProvider>();
        var signHandler = new SignConsultationCommandHandler(
            consultRepo,
            staffRepo,
            queueRepo,
            appointmentRepo,
            patientRepo,
            uow,
            _clinicContext,
            identity,
            Substitute.For<IPatientAppointmentPublisher>(),
            Substitute.For<IPrescriptionPublisher>(),
            Substitute.For<IClaimSlipService>(),
            Substitute.For<IPatientDocumentPublisher>(),
            dispensingLogRepository: null);

        var signed = await signHandler.Handle(new SignConsultationCommand(initialDraft.Id, "0102030"), CancellationToken.None);
        signed.IsSigned.Should().BeTrue();

        var logs = await db.ClinicDispensingLogs
            .Where(l => l.ConsultationEncounterId == initialDraft.Id)
            .ToListAsync();
        logs.Should().ContainSingle(l =>
            l.Source == ClinicDispenseSource.DoctorConsultation &&
            l.ItemName == "Carbocisteine" &&
            l.QuantityDispensed == 2 &&
            l.IsConsultationValidated);
    }

    [Fact]
    public async Task RelationalSqlite_RevertUnsignedConsultation_HandlesMultiEditDentalSupersedeChain_TransmittedYakap_AndUnlinksRetainedPaidOrSignedRecords()
    {
        var (conn, db, uow, sieve) = await CreateRelationalSqliteTestContextAsync();
        await using var _ = conn;
        await using var __ = db;

        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var patientFullName = $"{patient.LastName}, {patient.FirstName}";
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Marco",
            LastName = "Villanueva",
            Email = "marco-chain@clinic.test",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0099112",
            IsActive = true
        };
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientFullName,
            QueueNumber = "Q-DNT-01",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.RoutineCheckup,
            Priority = QueuePriority.Routine,
            Status = QueueStatus.InConsultation,
            CheckInTime = DateTime.UtcNow.AddMinutes(-30),
            DoctorId = doctor.Id,
            DoctorName = "Dr. Marco Villanueva"
        };
        var priorSignedEncounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientFullName,
            DoctorId = doctor.Id,
            DoctorName = "Dr. Marco Villanueva",
            EncounterDate = DateTime.UtcNow.AddDays(-30),
            IsSigned = true,
            SignedAt = DateTime.UtcNow.AddDays(-30)
        };
        var draftEncounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            QueueItemId = queue.Id,
            PatientId = patient.Id,
            PatientName = patientFullName,
            DoctorId = doctor.Id,
            DoctorName = "Dr. Marco Villanueva",
            EncounterDate = DateTime.UtcNow.AddMinutes(-10),
            IsSigned = false
        };

        // Multi-edit dental supersede chain: RecordA (prior signed) -> RecordB (draft edit 1) -> RecordC (draft edit 2)
        var recordBId = Guid.NewGuid();
        var recordCId = Guid.NewGuid();
        var recordA = new DentalToothRecord
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientFullName,
            ConsultationId = priorSignedEncounter.Id,
            ToothNumber = 36,
            Status = ToothStatus.Decayed,
            Surface = "O",
            ActiveSurface = null,
            IsCurrent = false,
            SupersededAt = DateTime.UtcNow.AddMinutes(-8),
            SupersededByRecordId = recordBId
        };
        var recordB = new DentalToothRecord
        {
            Id = recordBId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientFullName,
            ConsultationId = draftEncounter.Id,
            ToothNumber = 36,
            Status = ToothStatus.Filled,
            Surface = "O",
            ActiveSurface = null,
            IsCurrent = false,
            SupersededAt = DateTime.UtcNow.AddMinutes(-5),
            SupersededByRecordId = recordCId
        };
        var recordC = new DentalToothRecord
        {
            Id = recordCId,
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientFullName,
            ConsultationId = draftEncounter.Id,
            ToothNumber = 36,
            Status = ToothStatus.Filled,
            Surface = "MO",
            ActiveSurface = "MO",
            IsCurrent = true
        };

        // Externally transmitted YAKAP submission (must NOT be deleted, must unlink ConsultationEncounterId = null)
        var transmittedYakap = new YakapSubmission
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            ConsultationEncounterId = draftEncounter.Id,
            PatientId = patient.Id,
            AccreditationNo = "P87654321",
            CaseNo = "CASE-TX-01",
            LocalTransactionNo = "E-TX-001",
            SubmissionType = YakapSubmissionType.Fpe,
            ProcessingStatus = YakapProcessingStatus.Queued,
            SubmittedAtUtc = DateTime.UtcNow.AddMinutes(-3)
        };

        // Retained completed/paid/signed records referencing draftEncounter.Id (must survive with ConsultationId == null)
        var completedProc = new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientFullName,
            QueueItemId = queue.Id,
            ConsultationId = draftEncounter.Id,
            ProcedureName = "Nebulization",
            Category = "Nebulization",
            Status = ProcedureStatus.Completed,
            PerformedAt = DateTime.UtcNow.AddMinutes(-4)
        };
        var paidInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            InvoiceNumber = "INV-PAID-001",
            PatientId = patient.Id,
            PatientName = patientFullName,
            QueueItemId = queue.Id,
            ConsultationId = draftEncounter.Id,
            Status = InvoiceStatus.Paid,
            GrossAmount = 350m,
            NetAmount = 350m,
            AmountPaid = 350m,
            BalanceDue = 0m
        };
        var signedCert = new MedicalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            CertificateNumber = "MC-SGN-001",
            PatientId = patient.Id,
            PatientName = patientFullName,
            QueueItemId = queue.Id,
            ConsultationId = draftEncounter.Id,
            DoctorId = doctor.Id,
            DoctorName = "Dr. Marco Villanueva",
            PrcLicenseNumber = "0099112",
            IssueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Diagnosis = "Nebulization care",
            IsSigned = true
        };

        db.Patients.Add(patient);
        db.StaffMembers.Add(doctor);
        db.QueueItems.Add(queue);
        db.Consultations.AddRange(priorSignedEncounter, draftEncounter);
        db.DentalToothRecords.AddRange(recordA, recordB, recordC);
        db.YakapSubmissions.Add(transmittedYakap);
        db.Procedures.Add(completedProc);
        db.Invoices.Add(paidInvoice);
        db.MedicalCertificates.Add(signedCert);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var abandonHandler = new AbandonConsultationCommandHandler(
            uow.GetRepository<ConsultationEncounter>(),
            uow.GetRepository<QueueItem>(),
            uow,
            _clinicContext);

        var ok = await abandonHandler.Handle(
            new AbandonConsultationCommand(draftEncounter.Id, "Discard draft after multi-edit dental & paid nebulization", CancelVisit: false),
            CancellationToken.None);
        ok.Should().BeTrue();
        db.ChangeTracker.Clear();

        // Draft encounter and both draft dental records (B & C) are physically purged
        (await db.Consultations.IgnoreQueryFilters().AnyAsync(c => c.Id == draftEncounter.Id)).Should().BeFalse();
        var survivingDental = await db.DentalToothRecords.IgnoreQueryFilters()
            .Where(t => t.PatientId == patient.Id)
            .ToListAsync();
        survivingDental.Should().ContainSingle(t =>
            t.Id == recordA.Id &&
            t.IsCurrent &&
            t.SupersededByRecordId == null &&
            t.ActiveSurface == "O");

        // Transmitted YAKAP and completed/paid/signed records survive with ConsultationId/ConsultationEncounterId unlinked to null
        var survivingYakap = await db.YakapSubmissions.SingleAsync(y => y.Id == transmittedYakap.Id);
        survivingYakap.ConsultationEncounterId.Should().BeNull();

        var survivingProc = await db.Procedures.SingleAsync(p => p.Id == completedProc.Id);
        survivingProc.ConsultationId.Should().BeNull();

        var survivingInvoice = await db.Invoices.SingleAsync(i => i.Id == paidInvoice.Id);
        survivingInvoice.ConsultationId.Should().BeNull();

        var survivingCert = await db.MedicalCertificates.SingleAsync(m => m.Id == signedCert.Id);
        survivingCert.ConsultationId.Should().BeNull();
    }

    [Fact]
    public async Task RelationalSqlite_UpdateTriageVitals_AfterAsyncPhysicianReview_PreservesReviewedLogWithoutDuplicating_AndAddsOnlyNewItems()
    {
        var (conn, db, uow, sieve) = await CreateRelationalSqliteTestContextAsync();
        await using var _ = conn;
        await using var __ = db;

        var patient = Phase3TestKit.NewPatient(_clinicId, TenantId);
        var patientFullName = $"{patient.LastName}, {patient.FirstName}";
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            FirstName = "Elena",
            LastName = "Cruz",
            Email = "elena-triage@clinic.test",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0102030",
            IsActive = true
        };
        var queue = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = patientFullName,
            QueueNumber = "V-REV-01",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            VisitType = VisitType.PreventiveHealthAssessment,
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow.AddMinutes(-15)
        };

        db.Patients.Add(patient);
        db.StaffMembers.Add(doctor);
        db.QueueItems.Add(queue);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var queueRepo = uow.GetRepository<QueueItem>();
        var vitalsRepo = uow.GetRepository<PatientVitals>();
        var patientRepo = uow.GetRepository<Patient>();
        var dispensingRepo = uow.GetRepository<ClinicDispensingLog>();

        // 1. Nurse records vitals with 1 OTC medicine (with dispensingLogRepository omitted -> resolves via IRepositoryProvider)
        var recordHandler = new RecordTriageVitalsCommandHandler(
            queueRepo,
            vitalsRepo,
            patientRepo,
            uow,
            _clinicContext,
            dispensingLogRepository: null);

        var recorded = await recordHandler.Handle(
            new RecordTriageVitalsCommand(
                QueueItemId: queue.Id,
                NurseId: null,
                RecordedByNurseName: "Nurse Joy, RN",
                SystolicBp: 118,
                DiastolicBp: 76,
                HeartRateBpm: 78,
                TemperatureCelsius: 37.6m,
                RespiratoryRateBreathsPerMin: 18,
                OxygenSaturationPercent: 99,
                HeightCm: 165m,
                WeightKg: 60m,
                PainScore: 2,
                Notes: "Mild headache",
                RosCategory: "Neurological",
                ChiefComplaint: "Tension headache",
                HomeInstructions: "Hydrate and rest",
                DispensedItems: new List<TriageDispensedItemInput>
                {
                    new(
                        ItemName: "Paracetamol",
                        ItemCategory: "Medicine",
                        DosageOrSpec: "500mg",
                        FormOrUnit: "Tablet",
                        QuantityDispensed: 2,
                        DirectionsOrInstructions: "1 tab q6h PRN",
                        RosCategory: "Neurological")
                }),
            CancellationToken.None);
        recorded.DispensedItems.Should().ContainSingle();
        var reviewedLogId = recorded.DispensedItems![0].Id;
        db.ChangeTracker.Clear();

        // 2. Doctor completes async physician review of the OTC item
        var reviewHandler = new ReviewClinicDispensingLogCommandHandler(
            dispensingRepo,
            uow,
            _clinicContext,
            uow.GetRepository<StaffMember>(),
            queueRepo,
            vitalsRepo);
        var reviewDto = await reviewHandler.Handle(
            new ReviewClinicDispensingLogCommand(reviewedLogId, doctor.Id, "Dr. Elena Cruz", "Appropriate OTC starter dose", InterventionFlagged: false),
            CancellationToken.None);
        reviewDto.ReviewedAt.Should().NotBeNull();
        db.ChangeTracker.Clear();

        // 3. Nurse edits vitals via EditVitalsModal (re-submitting hydrated reviewed item WITH Id + 1 newly added supply item)
        var updateHandler = new UpdateTriageVitalsCommandHandler(
            queueRepo,
            vitalsRepo,
            patientRepo,
            uow,
            _clinicContext,
            dispensingLogRepository: null);

        var updated1 = await updateHandler.Handle(
            new UpdateTriageVitalsCommand(
                QueueItemId: queue.Id,
                NurseId: null,
                RecordedByNurseName: "Nurse Joy, RN",
                SystolicBp: 116,
                DiastolicBp: 74,
                HeartRateBpm: 76,
                TemperatureCelsius: 37.2m,
                RespiratoryRateBreathsPerMin: 18,
                OxygenSaturationPercent: 99,
                HeightCm: 165m,
                WeightKg: 60m,
                PainScore: 1,
                Notes: "Headache improving, minor finger abrasion dressed",
                VisualAcuityLeft: null,
                VisualAcuityRight: null,
                RosCategory: "Neurological",
                ChiefComplaint: "Tension headache",
                HomeInstructions: "Hydrate and keep dressing dry",
                DispensedItems: new List<TriageDispensedItemInput>
                {
                    new(
                        ItemName: "Paracetamol",
                        ItemCategory: "Medicine",
                        DosageOrSpec: "500mg",
                        FormOrUnit: "Tablet",
                        QuantityDispensed: 2,
                        DirectionsOrInstructions: "1 tab q6h PRN",
                        RosCategory: "Neurological",
                        Id: reviewedLogId),
                    new(
                        ItemName: "Adhesive Bandage",
                        ItemCategory: "MedicalSupply",
                        DosageOrSpec: "Standard",
                        FormOrUnit: "Piece",
                        QuantityDispensed: 2,
                        DirectionsOrInstructions: "Replace if wet",
                        RosCategory: "Dermatologic")
                }),
            CancellationToken.None);
        db.ChangeTracker.Clear();

        // 4. Even if a legacy client omits Id on a subsequent edit, signature matching still prevents duplicating the reviewed row
        var updated2 = await updateHandler.Handle(
            new UpdateTriageVitalsCommand(
                QueueItemId: queue.Id,
                NurseId: null,
                RecordedByNurseName: "Nurse Joy, RN",
                SystolicBp: 115,
                DiastolicBp: 75,
                HeartRateBpm: 75,
                TemperatureCelsius: 37.0m,
                RespiratoryRateBreathsPerMin: 18,
                OxygenSaturationPercent: 99,
                HeightCm: 165m,
                WeightKg: 60m,
                PainScore: 0,
                Notes: "Stable for discharge",
                VisualAcuityLeft: null,
                VisualAcuityRight: null,
                RosCategory: "Neurological",
                ChiefComplaint: "Tension headache",
                HomeInstructions: "Hydrate and keep dressing dry",
                DispensedItems: new List<TriageDispensedItemInput>
                {
                    new(
                        ItemName: "Paracetamol",
                        ItemCategory: "Medicine",
                        DosageOrSpec: "500mg",
                        FormOrUnit: "Tablet",
                        QuantityDispensed: 2,
                        DirectionsOrInstructions: "1 tab q6h PRN",
                        RosCategory: "Neurological",
                        Id: null),
                    new(
                        ItemName: "Adhesive Bandage",
                        ItemCategory: "MedicalSupply",
                        DosageOrSpec: "Standard",
                        FormOrUnit: "Piece",
                        QuantityDispensed: 2,
                        DirectionsOrInstructions: "Replace if wet",
                        RosCategory: "Dermatologic")
                }),
            CancellationToken.None);
        db.ChangeTracker.Clear();

        var allLogs = await db.ClinicDispensingLogs.IgnoreQueryFilters()
            .Where(l => l.QueueItemId == queue.Id && !l.IsDeleted)
            .ToListAsync();
        allLogs.Should().HaveCount(2, "already-reviewed nurse OTC logs must never be duplicated when nurse vitals are edited");
        allLogs.Count(l => l.ItemName == "Paracetamol" && l.ReviewedAt != null).Should().Be(1);
        allLogs.Count(l => l.ItemName == "Adhesive Bandage" && l.ReviewedAt == null).Should().Be(1);
        updated2.DispensedItems.Should().HaveCount(2);
    }

    private static string DecodeQuestPdfText(byte[] pdfBytes)
    {
        var span = pdfBytes.AsSpan();
        var streamToken = "stream"u8;
        var endStreamToken = "endstream"u8;
        var decompressedStreams = new List<string>();

        int pos = 0;
        while (pos < pdfBytes.Length)
        {
            var streamIdx = span.Slice(pos).IndexOf(streamToken);
            if (streamIdx < 0) break;
            int streamStart = pos + streamIdx + streamToken.Length;
            if (streamStart < pdfBytes.Length && pdfBytes[streamStart] == '\r') streamStart++;
            if (streamStart < pdfBytes.Length && pdfBytes[streamStart] == '\n') streamStart++;

            var endIdx = span.Slice(streamStart).IndexOf(endStreamToken);
            if (endIdx < 0) break;
            int rawLength = endIdx;
            int streamLength = rawLength;
            if (streamLength > 0 && pdfBytes[streamStart + streamLength - 1] == '\n')
            {
                streamLength--;
                if (streamLength > 0 && pdfBytes[streamStart + streamLength - 1] == '\r') streamLength--;
            }
            else if (streamLength > 0 && pdfBytes[streamStart + streamLength - 1] == '\r')
            {
                streamLength--;
            }

            string? content = null;
            try
            {
                using var mem = new MemoryStream(pdfBytes, streamStart, streamLength);
                using var zlib = new System.IO.Compression.ZLibStream(mem, System.IO.Compression.CompressionMode.Decompress);
                using var reader = new StreamReader(zlib, Encoding.UTF8);
                content = reader.ReadToEnd();
            }
            catch
            {
                if (rawLength > 6)
                {
                    try
                    {
                        using var deflateMem = new MemoryStream(pdfBytes, streamStart + 2, rawLength - 2);
                        using var deflate = new System.IO.Compression.DeflateStream(deflateMem, System.IO.Compression.CompressionMode.Decompress);
                        using var reader = new StreamReader(deflate, Encoding.UTF8);
                        content = reader.ReadToEnd();
                    }
                    catch
                    {
                        // Non-Flate image stream
                    }
                }
            }

            if (content is not null)
            {
                decompressedStreams.Add(content);
            }

            pos = streamStart + endIdx + endStreamToken.Length;
        }

        var cmaps = new List<Dictionary<string, string>>();
        foreach (var stream in decompressedStreams)
        {
            if (!stream.Contains("begincmap", StringComparison.Ordinal)) continue;
            var cmap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            int bfCharIdx = 0;
            while ((bfCharIdx = stream.IndexOf("beginbfchar", bfCharIdx, StringComparison.Ordinal)) >= 0)
            {
                int endBfChar = stream.IndexOf("endbfchar", bfCharIdx, StringComparison.Ordinal);
                if (endBfChar < 0) break;
                var block = stream.Substring(bfCharIdx, endBfChar - bfCharIdx);
                foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(block, @"<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>"))
                {
                    var src = m.Groups[1].Value;
                    var dstHex = m.Groups[2].Value;
                    var dstSb = new StringBuilder();
                    for (int i = 0; i + 4 <= dstHex.Length; i += 4)
                    {
                        if (int.TryParse(dstHex.Substring(i, 4), System.Globalization.NumberStyles.HexNumber, null, out int cp))
                        {
                            dstSb.Append((char)cp);
                        }
                    }
                    cmap[src] = dstSb.ToString();
                }
                bfCharIdx = endBfChar + 9;
            }

            int bfRangeIdx = 0;
            while ((bfRangeIdx = stream.IndexOf("beginbfrange", bfRangeIdx, StringComparison.Ordinal)) >= 0)
            {
                int endBfRange = stream.IndexOf("endbfrange", bfRangeIdx, StringComparison.Ordinal);
                if (endBfRange < 0) break;
                var block = stream.Substring(bfRangeIdx, endBfRange - bfRangeIdx);
                foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(block, @"<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>"))
                {
                    if (int.TryParse(m.Groups[1].Value, System.Globalization.NumberStyles.HexNumber, null, out int startSrc) &&
                        int.TryParse(m.Groups[2].Value, System.Globalization.NumberStyles.HexNumber, null, out int endSrc) &&
                        int.TryParse(m.Groups[3].Value, System.Globalization.NumberStyles.HexNumber, null, out int startDst))
                    {
                        for (int s = startSrc, d = startDst; s <= endSrc; s++, d++)
                        {
                            cmap[s.ToString("X4")] = ((char)d).ToString();
                        }
                    }
                }
                bfRangeIdx = endBfRange + 10;
            }

            if (cmap.Count > 0) cmaps.Add(cmap);
        }

        var decodedSb = new StringBuilder();
        foreach (var stream in decompressedStreams)
        {
            if (stream.Contains("begincmap", StringComparison.Ordinal)) continue;
            var hexMatches = System.Text.RegularExpressions.Regex.Matches(stream, @"<([0-9A-Fa-f]{4,})>");
            foreach (var cmap in cmaps)
            {
                foreach (System.Text.RegularExpressions.Match m in hexMatches)
                {
                    var hex = m.Groups[1].Value;
                    for (int i = 0; i + 4 <= hex.Length; i += 4)
                    {
                        if (cmap.TryGetValue(hex.Substring(i, 4), out var ch) && ch.Length > 0 && ch[0] != (char)0)
                        {
                            decodedSb.Append(ch);
                        }
                    }
                    decodedSb.Append(' ');
                }
                decodedSb.AppendLine();
            }
        }

        var decoded = decodedSb.ToString();
        var collapsed = System.Text.RegularExpressions.Regex.Replace(
            decoded,
            @"(?<=[A-Za-z#:(-]) (?=[A-Za-z0-9#):,.%/-])|(?<=\d) (?=[\d#):,.%/-])",
            "");
        var normalized = System.Text.RegularExpressions.Regex.Replace(collapsed, @"\s+", " ");
        var spaceless = System.Text.RegularExpressions.Regex.Replace(decoded, @"\s+", "");
        return normalized + "\n" + spaceless;
    }
}
