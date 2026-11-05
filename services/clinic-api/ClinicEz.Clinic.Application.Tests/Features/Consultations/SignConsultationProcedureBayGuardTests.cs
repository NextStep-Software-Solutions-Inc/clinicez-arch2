using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Consultations;

public class SignConsultationProcedureBayGuardTests
{
    [Fact]
    public async Task SignConsultation_WhenQueueStatusIsPendingProcedure_ThrowsBadRequestException()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var encounterId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var doctor = new StaffMember
        {
            Id = doctorId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Justine",
            LastName = "Tabasan",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-12345",
            Specialty = "General Practice"
        };
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueNumber = "DV-001",
            PatientId = patientId,
            PatientName = "Clarisse Alvarado",
            Status = QueueStatus.PendingProcedure // In procedure bay!
        };
        await context.QueueItems.AddAsync(queueItem);

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            PatientName = "Clarisse Alvarado",
            DoctorId = doctorId,
            DoctorName = "Dr. Justine Tabasan",
            IsSigned = false
        };
        await context.Consultations.AddAsync(encounter);
        await context.SaveChangesAsync();

        var handler = new SignConsultationCommandHandler(
            consultationRepo, staffRepo, queueRepo, apptRepo, patientRepo, uow, clinicContext,
            Substitute.For<IClinicIdentityProvider>(), Substitute.For<IPatientAppointmentPublisher>(),
            Substitute.For<IPrescriptionPublisher>(), Phase3TestKit.Claims(), Phase3TestKit.Documents(context),
            procedureRepository: procRepo);

        // Act & Assert
        var act = async () => await handler.Handle(new SignConsultationCommand(encounterId), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Procedure Bay (Pending Procedure)*");
    }

    [Fact]
    public async Task SignConsultation_WhenActiveProceduresExistForEncounter_ThrowsBadRequestException()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var encounterId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var doctor = new StaffMember
        {
            Id = doctorId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Wave",
            LastName = "Ambray",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-12345",
            Specialty = "General Practice"
        };
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueNumber = "DV-001",
            PatientId = patientId,
            PatientName = "Clarisse Alvarado",
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
            PatientName = "Clarisse Alvarado",
            DoctorId = doctorId,
            DoctorName = "Dr. Wave Ambray",
            IsSigned = false
        };
        await context.Consultations.AddAsync(encounter);

        // Add an active/ordered procedure
        var proc = new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Clarisse Alvarado",
            QueueItemId = queueItemId,
            ConsultationId = encounterId,
            ProcedureCode = "PROC-NEB",
            ProcedureName = "Nebulization Therapy",
            Category = "Procedure",
            Status = ProcedureStatus.Ordered, // Pending execution!
            ScheduledAt = DateTime.UtcNow
        };
        await context.Procedures.AddAsync(proc);
        await context.SaveChangesAsync();

        var handler = new SignConsultationCommandHandler(
            consultationRepo, staffRepo, queueRepo, apptRepo, patientRepo, uow, clinicContext,
            Substitute.For<IClinicIdentityProvider>(), Substitute.For<IPatientAppointmentPublisher>(),
            Substitute.For<IPrescriptionPublisher>(), Phase3TestKit.Claims(), Phase3TestKit.Documents(context),
            procedureRepository: procRepo);

        // Act & Assert
        var act = async () => await handler.Handle(new SignConsultationCommand(encounterId), CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*in-clinic procedures are still pending in the Procedure Bay*");
    }

    [Fact]
    public async Task SignConsultation_WhenProceduresAreCompletedAndReEvaluated_SignsSuccessfully()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var encounterId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var doctor = new StaffMember
        {
            Id = doctorId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Wave",
            LastName = "Ambray",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-12345",
            Specialty = "General Practice"
        };
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueNumber = "DV-001",
            PatientId = patientId,
            PatientName = "Clarisse Alvarado",
            Status = QueueStatus.ReEvaluation // Returned from treatment room!
        };
        await context.QueueItems.AddAsync(queueItem);

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            PatientName = "Clarisse Alvarado",
            DoctorId = doctorId,
            DoctorName = "Dr. Wave Ambray",
            IsSigned = false
        };
        await context.Consultations.AddAsync(encounter);

        // Add a completed procedure
        var proc = new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Clarisse Alvarado",
            QueueItemId = queueItemId,
            ConsultationId = encounterId,
            ProcedureCode = "PROC-NEB",
            ProcedureName = "Nebulization Therapy",
            Category = "Procedure",
            Status = ProcedureStatus.Completed, // Completed!
            PerformedAt = DateTime.UtcNow
        };
        await context.Procedures.AddAsync(proc);
        await context.SaveChangesAsync();

        var handler = new SignConsultationCommandHandler(
            consultationRepo, staffRepo, queueRepo, apptRepo, patientRepo, uow, clinicContext,
            Substitute.For<IClinicIdentityProvider>(), Substitute.For<IPatientAppointmentPublisher>(),
            Substitute.For<IPrescriptionPublisher>(), Phase3TestKit.Claims(), Phase3TestKit.Documents(context),
            procedureRepository: procRepo);

        // Act
        var result = await handler.Handle(new SignConsultationCommand(encounterId), CancellationToken.None);

        // Assert
        result.IsSigned.Should().BeTrue();
        result.SignedAt.Should().NotBeNull();
        queueItem.Status.Should().Be(QueueStatus.Completed);
    }

    [Fact]
    public async Task SignConsultation_WhenProceduresAreCancelled_SignsSuccessfully()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var encounterId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var doctor = new StaffMember
        {
            Id = doctorId,
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Wave",
            LastName = "Ambray",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-12345",
            Specialty = "General Practice"
        };
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueNumber = "DV-001",
            PatientId = patientId,
            PatientName = "Clarisse Alvarado",
            Status = QueueStatus.InConsultation // Reverted after procedure cancellation!
        };
        await context.QueueItems.AddAsync(queueItem);

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            PatientName = "Clarisse Alvarado",
            DoctorId = doctorId,
            DoctorName = "Dr. Wave Ambray",
            IsSigned = false
        };
        await context.Consultations.AddAsync(encounter);

        // Add a cancelled procedure
        var proc = new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Clarisse Alvarado",
            QueueItemId = queueItemId,
            ConsultationId = encounterId,
            ProcedureCode = "PROC-NEB",
            ProcedureName = "Nebulization Therapy",
            Category = "Procedure",
            Status = ProcedureStatus.Cancelled, // Cancelled!
            ClinicalNotes = "Cancelled: Patient requested to postpone"
        };
        await context.Procedures.AddAsync(proc);
        await context.SaveChangesAsync();

        var handler = new SignConsultationCommandHandler(
            consultationRepo, staffRepo, queueRepo, apptRepo, patientRepo, uow, clinicContext,
            Substitute.For<IClinicIdentityProvider>(), Substitute.For<IPatientAppointmentPublisher>(),
            Substitute.For<IPrescriptionPublisher>(), Phase3TestKit.Claims(), Phase3TestKit.Documents(context),
            procedureRepository: procRepo);

        // Act
        var result = await handler.Handle(new SignConsultationCommand(encounterId), CancellationToken.None);

        // Assert
        result.IsSigned.Should().BeTrue();
        result.SignedAt.Should().NotBeNull();
        queueItem.Status.Should().Be(QueueStatus.Completed);
    }
}
