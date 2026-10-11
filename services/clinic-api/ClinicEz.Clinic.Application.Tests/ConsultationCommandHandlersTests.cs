using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.DTOs;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ConsultationCommandHandlersTests
{
    [Fact]
    public async Task CreateConsultation_WithDiagnosesAndPrescriptions_DraftsEncounterSuccessfully()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var handler = new CreateConsultationCommandHandler(consultationRepo, queueRepo, uow, clinicContext);

        var command = new CreateConsultationCommand(
            patientId,
            "Maria Santos",
            doctorId,
            "Dr. Jose Rizal",
            null,
            null,
            "Headaches and elevated blood pressure",
            "BP 140/90, regular heart rate",
            "Essential Hypertension Stage 1",
            "Lifestyle modification and Amlodipine 5mg OD",
            new List<DiagnosisInput>
            {
                new("I10", "Essential (primary) hypertension", true)
            },
            new List<PrescriptionInput>
            {
                new("Amlodipine", "Norvasc", "5mg", "Tablet", "Take 1 tablet once daily in the morning", 30, 30, 0, false)
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientName.Should().Be("Maria Santos");
        result.DoctorName.Should().Be("Dr. Jose Rizal");
        result.IsSigned.Should().BeFalse();
        result.Diagnoses.Should().HaveCount(1);
        result.Diagnoses[0].Icd10Code.Should().Be("I10");
        result.Prescriptions.Should().HaveCount(1);
        result.Prescriptions[0].GenericName.Should().Be("Amlodipine");

        var saved = await context.Consultations
            .Include(c => c.Diagnoses)
            .Include(c => c.Prescriptions)
            .FirstOrDefaultAsync(c => c.Id == result.Id);

        saved.Should().NotBeNull();
        saved!.Diagnoses.Should().HaveCount(1);
        saved.Prescriptions.Should().HaveCount(1);
    }

    [Fact]
    public async Task SignConsultation_SnapshotsDoctorCredentials_LocksEncounter_AndCompletesQueue()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var encounterId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var appointmentPublisher = Substitute.For<IPatientAppointmentPublisher>();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var doctor = new StaffMember
        {
            Id = doctorId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Jose",
            LastName = "Rizal",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-998877",
            PtrNumber = "PTR-112233",
            S2LicenseNumber = "S2-445566",
            Specialty = "Internal Medicine"
        };
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueNumber = "Q-001",
            PatientId = patientId,
            PatientName = "Maria Santos",
            Status = QueueStatus.InConsultation
        };
        await context.QueueItems.AddAsync(queueItem);

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            PatientName = "Maria Santos",
            DoctorId = doctorId,
            DoctorName = "Dr. Jose Rizal",
            Subjective = "Subj",
            Objective = "Obj",
            Assessment = "I10 Hypertension",
            Plan = "Plan",
            IsSigned = false
        };
        await context.Consultations.AddAsync(encounter);
        await context.SaveChangesAsync();

        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns(new ClinicIdentity(tenantId, clinicId, "Apex Clinic"));
        var handler = new SignConsultationCommandHandler(
            consultationRepo, staffRepo, queueRepo, apptRepo, TestDbHelper.CreateRepository<ClinicPatient>(context, sieve), uow, clinicContext,
            identity, appointmentPublisher, Substitute.For<IPrescriptionPublisher>(),
            Phase3TestKit.Claims(), Phase3TestKit.Documents(context));

        // Act
        var result = await handler.Handle(new SignConsultationCommand(encounterId), CancellationToken.None);

        // Assert
        result.IsSigned.Should().BeTrue();
        result.SignedAt.Should().NotBeNull();
        result.DoctorPrcLicense.Should().Be("PRC-998877");
        result.DoctorPtr.Should().Be("PTR-112233");
        result.DoctorS2License.Should().Be("S2-445566");

        var updatedQueue = await context.QueueItems.FirstAsync(q => q.Id == queueItemId);
        updatedQueue.Status.Should().Be(QueueStatus.Completed);
        updatedQueue.CompletedTime.Should().NotBeNull();

        await appointmentPublisher.Received(1).PublishAppointmentUpdatedAsync(
            Arg.Is<ClinicPushAppointmentsPayload>(p =>
                p.PatientId == patientId &&
                p.Appointments[0].ClinicName == "Apex Clinic" &&
                p.Appointments[0].Status == AppointmentStatus.Completed.ToString() &&
                p.Appointments[0].ClinicalAssessment == "I10 Hypertension" &&
                p.Appointments[0].DoctorPlan == "Plan"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SignConsultation_DangerousDrugWithoutS2License_ThrowsBadRequest()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var encounterId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var appointmentPublisher = Substitute.For<IPatientAppointmentPublisher>();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var doctorWithoutS2 = new StaffMember
        {
            Id = doctorId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Juan",
            LastName = "Luna",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-123456",
            S2LicenseNumber = null // No S2 license
        };
        await context.StaffMembers.AddAsync(doctorWithoutS2);

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Test",
            DoctorId = doctorId,
            DoctorName = "Dr. Juan Luna",
            IsSigned = false,
            Prescriptions = new List<PrescriptionItem>
            {
                new()
                {
                    GenericName = "Morphine Sulfate",
                    Dosage = "10mg",
                    Form = "Tablet",
                    Sig = "PRN severe pain",
                    Quantity = 10,
                    IsDangerousDrug = true // PDEA Dangerous Drug!
                }
            }
        };
        await context.Consultations.AddAsync(encounter);
        await context.SaveChangesAsync();

        var handler = new SignConsultationCommandHandler(
            consultationRepo, staffRepo, queueRepo, apptRepo, TestDbHelper.CreateRepository<ClinicPatient>(context, sieve), uow, clinicContext,
            Substitute.For<IClinicIdentityProvider>(), appointmentPublisher, Substitute.For<IPrescriptionPublisher>(),
            Phase3TestKit.Claims(), Phase3TestKit.Documents(context));

        // Act & Assert
        var act = async () => await handler.Handle(new SignConsultationCommand(encounterId), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*PDEA controlled/dangerous drug prescriptions, but Doctor S2 License number is missing*");
    }

    [Fact]
    public async Task UpdateConsultation_WithYakapEligible_SnapshotsDoctorPan_AndAssignsJourneyNumbers()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var encounterId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var diagnosisRepo = TestDbHelper.CreateRepository<EncounterDiagnosis>(context, sieve);
        var prescriptionRepo = TestDbHelper.CreateRepository<PrescriptionItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var doctor = new StaffMember
        {
            Id = doctorId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Maria",
            LastName = "Clara",
            Role = StaffRole.Doctor,
            PhilHealthPan = "PAN-DOC-987654"
        };
        await context.StaffMembers.AddAsync(doctor);

        var settings = new ClinicSettings
        {
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Apex Family Care",
            AccreditationNumber = "PHIC-KONSULTA-09214"
        };
        await context.ClinicSettings.AddAsync(settings);

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            DoctorId = doctorId,
            DoctorName = "Dr. Maria Clara",
            EncounterDate = new DateTime(2026, 4, 15),
            IsYakapEligible = false,
            DoctorPhilHealthPan = null,
            HciCaseNo = null,
            HciTransNo = null,
            SoapTransNo = null
        };
        await context.Consultations.AddAsync(encounter);
        await context.SaveChangesAsync();

        var sequenceGenerator = Substitute.For<IPhilHealthSequenceGenerator>();
        var journeyNumbers = new PhilHealthPatientJourneyNumbers(
            CaseNumber: "C00921202600001",
            EnlistmentTransactionNumber: "E00921202600001",
            ProfilingTransactionNumber: "P00921202600001",
            SoapTransactionNumber: "S00921202600001");

        sequenceGenerator.AssignPatientJourneyNumbersAsync(
            tenantId,
            clinicId,
            patientId,
            encounterId,
            "PHIC-KONSULTA-09214",
            "2026",
            Arg.Any<CancellationToken>())
            .Returns(journeyNumbers);

        var handler = new UpdateConsultationCommandHandler(
            consultationRepo,
            diagnosisRepo,
            prescriptionRepo,
            uow,
            clinicContext,
            staffRepo,
            settingsRepo,
            sequenceGenerator);

        var command = new UpdateConsultationCommand(
            Id: encounterId,
            Subjective: "Konsulta consultation notes",
            Objective: null,
            Assessment: null,
            Plan: null,
            Diagnoses: null,
            Prescriptions: null,
            IsYakapEligible: true,
            PhilHealthAtc: "ATC-KON-2026-001");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.IsYakapEligible.Should().BeTrue();
        result.DoctorPhilHealthPan.Should().Be("PAN-DOC-987654");
        result.PhilHealthAtc.Should().Be("ATC-KON-2026-001");
        result.HciCaseNo.Should().Be("C00921202600001");
        result.HciTransNo.Should().Be("E00921202600001");
        result.SoapTransNo.Should().Be("S00921202600001");

        var savedEncounter = await context.Consultations.FirstAsync(c => c.Id == encounterId);
        savedEncounter.IsYakapEligible.Should().BeTrue();
        savedEncounter.DoctorPhilHealthPan.Should().Be("PAN-DOC-987654");
        savedEncounter.PhilHealthAtc.Should().Be("ATC-KON-2026-001");
        savedEncounter.HciCaseNo.Should().Be("C00921202600001");
        savedEncounter.HciTransNo.Should().Be("E00921202600001");
        savedEncounter.SoapTransNo.Should().Be("S00921202600001");
    }

    [Fact]
    public async Task UpdateConsultation_StandardEncounter_DoesNotInvokeSequenceGeneratorOrPanSnapshot()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var encounterId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var diagnosisRepo = TestDbHelper.CreateRepository<EncounterDiagnosis>(context, sieve);
        var prescriptionRepo = TestDbHelper.CreateRepository<PrescriptionItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var doctor = new StaffMember
        {
            Id = doctorId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Maria",
            LastName = "Clara",
            Role = StaffRole.Doctor,
            PhilHealthPan = "PAN-DOC-987654"
        };
        await context.StaffMembers.AddAsync(doctor);

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            DoctorId = doctorId,
            DoctorName = "Dr. Maria Clara",
            IsYakapEligible = false
        };
        await context.Consultations.AddAsync(encounter);
        await context.SaveChangesAsync();

        var sequenceGenerator = Substitute.For<IPhilHealthSequenceGenerator>();
        var handler = new UpdateConsultationCommandHandler(
            consultationRepo,
            diagnosisRepo,
            prescriptionRepo,
            uow,
            clinicContext,
            staffRepo,
            settingsRepo,
            sequenceGenerator);

        var command = new UpdateConsultationCommand(
            Id: encounterId,
            Subjective: "Standard private checkup",
            Objective: "Vitals normal",
            Assessment: "Healthy",
            Plan: "Annual followup",
            Diagnoses: null,
            Prescriptions: null,
            IsYakapEligible: false);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.IsYakapEligible.Should().BeFalse();
        result.DoctorPhilHealthPan.Should().BeNull();
        result.HciCaseNo.Should().BeNull();
        result.HciTransNo.Should().BeNull();
        result.SoapTransNo.Should().BeNull();

        await sequenceGenerator.DidNotReceiveWithAnyArgs().AssignPatientJourneyNumbersAsync(
            default!, default, default, default, default!, default!, default);
    }

    [Fact]
    public async Task UpdateConsultation_NineSystemPhysicalExamFindings_PersistsAndDeserializesCorrectly()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var encounterId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var diagnosisRepo = TestDbHelper.CreateRepository<EncounterDiagnosis>(context, sieve);
        var prescriptionRepo = TestDbHelper.CreateRepository<PrescriptionItem>(context, sieve);

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Maria Clara"
        };
        await context.Consultations.AddAsync(encounter);
        await context.SaveChangesAsync();

        var examFindings = new NineSystemPhysicalExamFindings
        {
            Skin = new SystemExamFinding(true, null),
            Heent = new SystemExamFinding(true, null),
            Chest = new SystemExamFinding(true, null),
            Heart = new SystemExamFinding(true, null),
            Abdomen = new SystemExamFinding(true, null),
            Neuro = new SystemExamFinding(true, null),
            Rectal = new SystemExamFinding(true, null),
            Gu = new SystemExamFinding(true, null),
            Musculoskeletal = new SystemExamFinding(false, "Tenderness right shoulder on abduction")
        };

        var handler = new UpdateConsultationCommandHandler(
            consultationRepo,
            diagnosisRepo,
            prescriptionRepo,
            uow,
            clinicContext);

        var command = new UpdateConsultationCommand(
            Id: encounterId,
            Subjective: null,
            Objective: null,
            Assessment: null,
            Plan: null,
            Diagnoses: null,
            Prescriptions: null,
            PhysicalExamFindingsJson: System.Text.Json.JsonSerializer.Serialize(examFindings));

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.PhysicalExamFindingsJson.Should().NotBeNullOrWhiteSpace();

        var savedEncounter = await context.Consultations.FirstAsync(c => c.Id == encounterId);
        var parsed = savedEncounter.GetPhysicalExamFindings();
        parsed.Should().NotBeNull();
        parsed!.Musculoskeletal.IsNormal.Should().BeFalse();
        parsed.Musculoskeletal.Remarks.Should().Be("Tenderness right shoulder on abduction");
        parsed.Skin.IsNormal.Should().BeTrue();
        parsed.Heent.IsNormal.Should().BeTrue();
        parsed.Chest.IsNormal.Should().BeTrue();
        parsed.Heart.IsNormal.Should().BeTrue();
        parsed.Abdomen.IsNormal.Should().BeTrue();
        parsed.Neuro.IsNormal.Should().BeTrue();
        parsed.Rectal.IsNormal.Should().BeTrue();
        parsed.Gu.IsNormal.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateConsultation_YakapEncounter_DoctorWithoutPan_LeavesPanNullGracefully()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var encounterId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var diagnosisRepo = TestDbHelper.CreateRepository<EncounterDiagnosis>(context, sieve);
        var prescriptionRepo = TestDbHelper.CreateRepository<PrescriptionItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        // Doctor with NO PhilHealthPan configured
        var doctor = new StaffMember
        {
            Id = doctorId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Maria",
            LastName = "Clara",
            Role = StaffRole.Doctor,
            PhilHealthPan = null
        };
        await context.StaffMembers.AddAsync(doctor);

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            DoctorId = doctorId,
            DoctorName = "Dr. Maria Clara",
            IsYakapEligible = false
        };
        await context.Consultations.AddAsync(encounter);
        await context.SaveChangesAsync();

        var sequenceGenerator = Substitute.For<IPhilHealthSequenceGenerator>();
        var handler = new UpdateConsultationCommandHandler(
            consultationRepo,
            diagnosisRepo,
            prescriptionRepo,
            uow,
            clinicContext,
            staffRepo,
            settingsRepo,
            sequenceGenerator);

        var command = new UpdateConsultationCommand(
            Id: encounterId,
            Subjective: "Checkup",
            Objective: null,
            Assessment: null,
            Plan: null,
            Diagnoses: null,
            Prescriptions: null,
            IsYakapEligible: true);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.IsYakapEligible.Should().BeTrue();
        result.DoctorPhilHealthPan.Should().BeNull();
    }

    [Fact]
    public async Task UpdateConsultation_YakapEncounter_SequenceGeneratorThrows_GracefullyRecoversWithoutCrashing()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var encounterId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var diagnosisRepo = TestDbHelper.CreateRepository<EncounterDiagnosis>(context, sieve);
        var prescriptionRepo = TestDbHelper.CreateRepository<PrescriptionItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            DoctorId = doctorId,
            DoctorName = "Dr. Maria Clara",
            IsYakapEligible = false
        };
        await context.Consultations.AddAsync(encounter);
        await context.SaveChangesAsync();

        var sequenceGenerator = Substitute.For<IPhilHealthSequenceGenerator>();
        sequenceGenerator.AssignPatientJourneyNumbersAsync(
            Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<Guid>(), Arg.Any<Guid?>(),
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns<PhilHealthPatientJourneyNumbers>(_ => throw new InvalidOperationException("PostgreSQL sequence connection failed"));

        var handler = new UpdateConsultationCommandHandler(
            consultationRepo,
            diagnosisRepo,
            prescriptionRepo,
            uow,
            clinicContext,
            staffRepo,
            settingsRepo,
            sequenceGenerator);

        var command = new UpdateConsultationCommand(
            Id: encounterId,
            Subjective: "Yakap visit with offline sequence fallback",
            Objective: null,
            Assessment: null,
            Plan: null,
            Diagnoses: null,
            Prescriptions: null,
            IsYakapEligible: true);

        // Act - should not throw unhandled exception
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().NotThrowAsync();
        var updated = await context.Consultations.FirstAsync(c => c.Id == encounterId);
        updated.Subjective.Should().Be("Yakap visit with offline sequence fallback");
        updated.HciCaseNo.Should().BeNull(); // sequence failed, handled gracefully
    }

    [Fact]
    public async Task UpdateConsultation_SignedEncounter_ThrowsBadRequestException()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var encounterId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var diagnosisRepo = TestDbHelper.CreateRepository<EncounterDiagnosis>(context, sieve);
        var prescriptionRepo = TestDbHelper.CreateRepository<PrescriptionItem>(context, sieve);

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Maria Clara",
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        await context.Consultations.AddAsync(encounter);
        await context.SaveChangesAsync();

        var handler = new UpdateConsultationCommandHandler(
            consultationRepo,
            diagnosisRepo,
            prescriptionRepo,
            uow,
            clinicContext);

        var command = new UpdateConsultationCommand(
            Id: encounterId,
            Subjective: "Attempted modification to locked encounter",
            Objective: null,
            Assessment: null,
            Plan: null,
            Diagnoses: null,
            Prescriptions: null);

        // Act & Assert
        var act = async () => await handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*already signed and locked*");
    }

    [Theory]
    [InlineData("not a json")]
    [InlineData("{ malformed json }")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void PhysicalExamFindings_CorruptedOrEmptyJson_ReturnsNullSafely(string? input)
    {
        var encounter = new ConsultationEncounter
        {
            TenantId = "tenant_test",
            PatientName = "Test Patient",
            DoctorName = "Dr. Test",
            PhysicalExamFindingsJson = input
        };

        var findings = encounter.GetPhysicalExamFindings();
        findings.Should().BeNull();
    }

    [Fact]
    public void PhysicalExamFindings_AllNineSystemsNormal_AllEssentiallyNormalIsTrue()
    {
        var findings = new NineSystemPhysicalExamFindings
        {
            Skin = new SystemExamFinding(true),
            Heent = new SystemExamFinding(true),
            Chest = new SystemExamFinding(true),
            Heart = new SystemExamFinding(true),
            Abdomen = new SystemExamFinding(true),
            Neuro = new SystemExamFinding(true),
            Rectal = new SystemExamFinding(true),
            Gu = new SystemExamFinding(true),
            Musculoskeletal = new SystemExamFinding(true)
        };

        findings.AllEssentiallyNormal.Should().BeTrue();
    }

    [Theory]
    [InlineData("Skin")]
    [InlineData("Heent")]
    [InlineData("Chest")]
    [InlineData("Heart")]
    [InlineData("Abdomen")]
    [InlineData("Neuro")]
    [InlineData("Rectal")]
    [InlineData("Gu")]
    [InlineData("Musculoskeletal")]
    public void PhysicalExamFindings_AnySingleSystemAbnormal_AllEssentiallyNormalIsFalse(string systemName)
    {
        var findings = new NineSystemPhysicalExamFindings
        {
            Skin = new SystemExamFinding(systemName != "Skin"),
            Heent = new SystemExamFinding(systemName != "Heent"),
            Chest = new SystemExamFinding(systemName != "Chest"),
            Heart = new SystemExamFinding(systemName != "Heart"),
            Abdomen = new SystemExamFinding(systemName != "Abdomen"),
            Neuro = new SystemExamFinding(systemName != "Neuro"),
            Rectal = new SystemExamFinding(systemName != "Rectal"),
            Gu = new SystemExamFinding(systemName != "Gu"),
            Musculoskeletal = new SystemExamFinding(systemName != "Musculoskeletal")
        };

        findings.AllEssentiallyNormal.Should().BeFalse();
    }
}
