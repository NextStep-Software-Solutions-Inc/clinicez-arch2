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
}
