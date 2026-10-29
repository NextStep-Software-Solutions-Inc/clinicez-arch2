using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Immunizations.Commands;
using ClinicEz.Clinic.Application.Features.Procedures.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Adversarial Challenger Test Suite: Milestone 4
/// Probes procedure ordering gates, execution branching, treatment bay tracking,
/// and vaccine auto-discharge in Clinic API.
/// </summary>
public class NonDoctorWorkflowsMilestone4AdversarialTests
{
    private static (Guid clinicId, string tenantId, IClinicContext clinicContext) SetupClinicContext()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = $"tenant_m4_challenger_{Guid.NewGuid():N}";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(Guid.NewGuid());
        return (clinicId, tenantId, clinicContext);
    }

    #region Group 1: OrderProcedureCommand Adversarial Probes

    [Fact]
    public async Task Probe_OrderProcedure_NonDoctor_NonNurseOrderable_ThrowsBadRequestException()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var doctorOnlyItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "PROC-BIOPSY",
            Name = "Excisional Skin Biopsy",
            Category = "Minor Surgery",
            IsNurseOrderable = false,
            IsActive = true
        };
        await context.ServiceItems.AddAsync(doctorOnlyItem);
        await context.SaveChangesAsync();

        var handler = new OrderProcedureCommandHandler(
            procRepo,
            uow,
            clinicContext,
            queueRepo: null,
            roomRepo: null,
            serviceRepo: serviceRepo,
            staffRepo: staffRepo);

        var command = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Patient Juan",
            ProcedureCode: "PROC-BIOPSY",
            ProcedureName: "Excisional Skin Biopsy");

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Only procedures flagged as nurse-orderable in the clinic catalog can be ordered by non-doctor staff. Doctor order required.*");
    }

    [Fact]
    public async Task Probe_OrderProcedure_NonDoctor_NurseOrderable_Succeeds()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var nurseItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "PROC-NEB",
            Name = "Nebulization Therapy",
            Category = "Nursing Procedures",
            IsNurseOrderable = true,
            IsActive = true
        };
        await context.ServiceItems.AddAsync(nurseItem);
        await context.SaveChangesAsync();

        var handler = new OrderProcedureCommandHandler(
            procRepo,
            uow,
            clinicContext,
            queueRepo: null,
            roomRepo: null,
            serviceRepo: serviceRepo,
            staffRepo: staffRepo);

        var command = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Asthmatic Patient",
            ProcedureCode: "PROC-NEB",
            ProcedureName: "Nebulization Therapy",
            ClinicalNotes: "Salbutamol 1 neb q4h");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.ProcedureCode.Should().Be("PROC-NEB");
        result.ProcedureName.Should().Be("Nebulization Therapy");
        result.Status.Should().Be(ProcedureStatus.Ordered);
        result.OrderedByDoctorId.Should().BeNull();
    }

    [Fact]
    public async Task Probe_OrderProcedure_DoctorWithPrc_DoctorOnlyProcedure_Succeeds()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var doctorId = Guid.NewGuid();
        var doctor = new StaffMember
        {
            Id = doctorId,
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Maria",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-1234567",
            IsActive = true
        };
        await context.StaffMembers.AddAsync(doctor);

        var doctorOnlyItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "PROC-BIOPSY",
            Name = "Excisional Skin Biopsy",
            Category = "Minor Surgery",
            IsNurseOrderable = false,
            IsActive = true
        };
        await context.ServiceItems.AddAsync(doctorOnlyItem);
        await context.SaveChangesAsync();

        var handler = new OrderProcedureCommandHandler(
            procRepo,
            uow,
            clinicContext,
            queueRepo: null,
            roomRepo: null,
            serviceRepo: serviceRepo,
            staffRepo: staffRepo);

        var command = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Patient Maria",
            ProcedureCode: "PROC-BIOPSY",
            ProcedureName: "Excisional Skin Biopsy",
            OrderedByDoctorId: doctorId,
            OrderedByDoctorName: "Dr. Maria Cruz");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.OrderedByDoctorId.Should().Be(doctorId);
        result.Status.Should().Be(ProcedureStatus.Ordered);
    }

    [Fact]
    public async Task Probe_OrderProcedure_DoctorWithoutPrc_DoctorOnlyProcedure_ThrowsBadRequestException()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var doctorWithoutPrcId = Guid.NewGuid();
        var doctor = new StaffMember
        {
            Id = doctorWithoutPrcId,
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "No",
            LastName = "License",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = null, // Missing PRC
            IsActive = true
        };
        await context.StaffMembers.AddAsync(doctor);

        var doctorOnlyItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "PROC-BIOPSY",
            Name = "Excisional Skin Biopsy",
            Category = "Minor Surgery",
            IsNurseOrderable = false,
            IsActive = true
        };
        await context.ServiceItems.AddAsync(doctorOnlyItem);
        await context.SaveChangesAsync();

        var handler = new OrderProcedureCommandHandler(
            procRepo,
            uow,
            clinicContext,
            queueRepo: null,
            roomRepo: null,
            serviceRepo: serviceRepo,
            staffRepo: staffRepo);

        var command = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Patient Maria",
            ProcedureCode: "PROC-BIOPSY",
            ProcedureName: "Excisional Skin Biopsy",
            OrderedByDoctorId: doctorWithoutPrcId,
            OrderedByDoctorName: "Dr. No License");

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Only procedures flagged as nurse-orderable in the clinic catalog can be ordered by non-doctor staff. Doctor order required.*");
    }

    [Fact]
    public async Task Probe_OrderProcedure_NonExistentProcedureCodeOrName_ThrowsBadRequestException()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var handler = new OrderProcedureCommandHandler(
            procRepo,
            uow,
            clinicContext,
            queueRepo: null,
            roomRepo: null,
            serviceRepo: serviceRepo,
            staffRepo: staffRepo);

        var command = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Unknown Procedure Patient",
            ProcedureCode: "PROC-UNKNOWN-999",
            ProcedureName: "Unregistered Experimental Therapy");

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Only procedures flagged as nurse-orderable*");
    }

    [Fact]
    public async Task Probe_OrderProcedure_EmptyPatientIdOrName_ThrowsBadRequestException()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var handler = new OrderProcedureCommandHandler(
            procRepo,
            uow,
            clinicContext);

        var commandEmptyId = new OrderProcedureCommand(
            PatientId: Guid.Empty,
            PatientName: "Test Patient");

        var actEmptyId = async () => await handler.Handle(commandEmptyId, CancellationToken.None);
        await actEmptyId.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*PatientId and PatientName are required*");

        var commandEmptyName = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "   ");

        var actEmptyName = async () => await handler.Handle(commandEmptyName, CancellationToken.None);
        await actEmptyName.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*PatientId and PatientName are required*");
    }

    [Fact]
    public async Task Probe_OrderProcedure_WithQueueItemId_TransitionsQueueToPendingProcedure_AndSetsTreatmentRoom()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);

        var queueItemId = Guid.NewGuid();
        var queueItem = new QueueItem
        {
            Id = queueItemId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientName = "Queue Patient",
            QueueNumber = "Q-301",
            Status = QueueStatus.Triaged,
            RoomOrStation = "Triage Station"
        };
        await context.QueueItems.AddAsync(queueItem);

        var serviceItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "PROC-WOUND",
            Name = "Wound Dressing & Debridement",
            Category = "Nursing Procedures",
            IsNurseOrderable = true,
            IsActive = true
        };
        await context.ServiceItems.AddAsync(serviceItem);
        await context.SaveChangesAsync();

        var handler = new OrderProcedureCommandHandler(
            procRepo,
            uow,
            clinicContext,
            queueRepo: queueRepo,
            roomRepo: null,
            serviceRepo: serviceRepo);

        var command = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Queue Patient",
            QueueItemId: queueItemId,
            ProcedureCode: "PROC-WOUND",
            ProcedureName: "Wound Dressing & Debridement",
            TargetRoomName: "Treatment Bay 3");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.TargetRoomName.Should().Be("Treatment Bay 3");

        var updatedQueue = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == queueItemId);
        updatedQueue.Should().NotBeNull();
        updatedQueue!.Status.Should().Be(QueueStatus.PendingProcedure);
        updatedQueue.RoomOrStation.Should().Be("Treatment Bay 3");
    }

    [Fact]
    public async Task Probe_OrderProcedure_WithQueueItemId_WhenQueueIsAlreadyCompleted_DoesNotReopenQueue()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);

        var queueItemId = Guid.NewGuid();
        var queueItem = new QueueItem
        {
            Id = queueItemId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientName = "Completed Patient",
            QueueNumber = "Q-302",
            Status = QueueStatus.Completed
        };
        await context.QueueItems.AddAsync(queueItem);

        var serviceItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "PROC-NEB",
            Name = "Nebulization Therapy",
            Category = "Nursing Procedures",
            IsNurseOrderable = true,
            IsActive = true
        };
        await context.ServiceItems.AddAsync(serviceItem);
        await context.SaveChangesAsync();

        var handler = new OrderProcedureCommandHandler(
            procRepo,
            uow,
            clinicContext,
            queueRepo: queueRepo,
            serviceRepo: serviceRepo);

        var command = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Completed Patient",
            QueueItemId: queueItemId,
            ProcedureCode: "PROC-NEB",
            ProcedureName: "Nebulization Therapy");

        await handler.Handle(command, CancellationToken.None);

        var recheckQueue = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == queueItemId);
        recheckQueue.Should().NotBeNull();
        recheckQueue!.Status.Should().Be(QueueStatus.Completed);
    }

    #endregion

    #region Group 2: RecordProcedureExecutionCommand Adversarial Probes

    [Fact]
    public async Task Probe_RecordProcedure_RequiresDoctorReEvaluation_ExplicitFalse_TransitionsToDischargedNonDoctor()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var queueItemId = Guid.NewGuid();
        var procedureId = Guid.NewGuid();
        var nurseId = Guid.NewGuid();

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientName = "Walk-in Dressing Patient",
            QueueNumber = "Q-401",
            Status = QueueStatus.PendingProcedure,
            RoomOrStation = "Treatment Bay A"
        };
        await context.QueueItems.AddAsync(queueItem);

        var procedure = new Procedure
        {
            Id = procedureId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Walk-in Dressing Patient",
            Category = "Nursing Procedures",
            QueueItemId = queueItemId,
            ProcedureName = "Wound Dressing",
            Status = ProcedureStatus.Ordered,
            TargetRoomName = "Treatment Bay A"
        };
        await context.Procedures.AddAsync(procedure);
        await context.SaveChangesAsync();

        var handler = new RecordProcedureExecutionCommandHandler(
            procRepo,
            uow,
            clinicContext,
            queueRepo);

        var command = new RecordProcedureExecutionCommand(
            ProcedureId: procedureId,
            PerformedByStaffId: nurseId,
            PerformedByStaffName: "Nurse Joy",
            RequiresDoctorReEvaluation: false,
            ClinicalNotes: "Clean dressing applied; no signs of active infection.");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be(ProcedureStatus.Completed);
        result.PerformedByStaffId.Should().Be(nurseId);
        result.PerformedByStaffName.Should().Be("Nurse Joy");

        var updatedQueue = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == queueItemId);
        updatedQueue.Should().NotBeNull();
        updatedQueue!.Status.Should().Be(QueueStatus.DischargedNonDoctor);
        updatedQueue.CompletedTime.Should().NotBeNull();
        updatedQueue.DischargedAt.Should().NotBeNull();
        updatedQueue.DischargedByStaffId.Should().Be(nurseId);
        updatedQueue.DischargeNotes.Should().Be("Clean dressing applied; no signs of active infection.");
        updatedQueue.RoomOrStation.Should().Be("Treatment Bay A");
    }

    [Fact]
    public async Task Probe_RecordProcedure_RequiresDoctorReEvaluation_ExplicitTrue_TransitionsToReEvaluation()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);

        var queueItemId = Guid.NewGuid();
        var procedureId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var room = new Room
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Name = "Consultation Room 3",
            DisplayOrder = 3,
            IsActive = true
        };
        await context.Rooms.AddAsync(room);

        var doctor = new StaffMember
        {
            Id = doctorId,
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Gregory",
            LastName = "House",
            Role = StaffRole.Doctor,
            IsActive = true,
            AssignedRoomIdsJson = $"[\"{room.Id}\"]"
        };
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientName = "Consult Patient",
            QueueNumber = "Q-402",
            DoctorId = doctorId,
            Status = QueueStatus.PendingProcedure,
            RoomOrStation = "Treatment Bay B"
        };
        await context.QueueItems.AddAsync(queueItem);

        var procedure = new Procedure
        {
            Id = procedureId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Consult Patient",
            Category = "Nursing Procedures",
            QueueItemId = queueItemId,
            ProcedureName = "Nebulization Therapy",
            OrderedByDoctorId = doctorId,
            Status = ProcedureStatus.Ordered,
            TargetRoomName = "Treatment Bay B"
        };
        await context.Procedures.AddAsync(procedure);
        await context.SaveChangesAsync();

        var handler = new RecordProcedureExecutionCommandHandler(
            procRepo,
            uow,
            clinicContext,
            queueRepo,
            staffRepo,
            roomRepo);

        var command = new RecordProcedureExecutionCommand(
            ProcedureId: procedureId,
            RequiresDoctorReEvaluation: true,
            ClinicalNotes: "Wheezing persistent after 1st cycle; return to MD.");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be(ProcedureStatus.Completed);

        var updatedQueue = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == queueItemId);
        updatedQueue.Should().NotBeNull();
        updatedQueue!.Status.Should().Be(QueueStatus.ReEvaluation);
        updatedQueue.RoomId.Should().Be(room.Id);
        updatedQueue.RoomOrStation.Should().Be("Consultation Room 3");
    }

    [Fact]
    public async Task Probe_RecordProcedure_RequiresDoctorReEvaluation_Null_StandaloneWalkIn_DefaultsToDischargedNonDoctor()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var queueItemId = Guid.NewGuid();
        var procedureId = Guid.NewGuid();

        // No doctor assigned to queue item or procedure (standalone walk-in)
        var queueItem = new QueueItem
        {
            Id = queueItemId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientName = "Standalone Patient",
            QueueNumber = "Q-403",
            DoctorId = null,
            Status = QueueStatus.PendingProcedure,
            RoomOrStation = "Treatment Bay C"
        };
        await context.QueueItems.AddAsync(queueItem);

        var procedure = new Procedure
        {
            Id = procedureId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Standalone Patient",
            Category = "Nursing Procedures",
            QueueItemId = queueItemId,
            ProcedureName = "Nebulization Therapy",
            OrderedByDoctorId = null,
            Status = ProcedureStatus.Ordered,
            TargetRoomName = "Treatment Bay C"
        };
        await context.Procedures.AddAsync(procedure);
        await context.SaveChangesAsync();

        var handler = new RecordProcedureExecutionCommandHandler(
            procRepo,
            uow,
            clinicContext,
            queueRepo);

        // RequiresDoctorReEvaluation is null (defaulted)
        var command = new RecordProcedureExecutionCommand(
            ProcedureId: procedureId,
            RequiresDoctorReEvaluation: null);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be(ProcedureStatus.Completed);

        var updatedQueue = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == queueItemId);
        updatedQueue.Should().NotBeNull();
        updatedQueue!.Status.Should().Be(QueueStatus.DischargedNonDoctor);
        updatedQueue.CompletedTime.Should().NotBeNull();
        updatedQueue.DischargedAt.Should().NotBeNull();
        updatedQueue.DischargeNotes.Should().Be("Discharged following nurse procedure execution.");
    }

    [Fact]
    public async Task Probe_RecordProcedure_RequiresDoctorReEvaluation_Null_DoctorConsultationOrigin_DefaultsToReEvaluation()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var queueItemId = Guid.NewGuid();
        var procedureId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var doctor = new StaffMember
        {
            Id = doctorId,
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Doctor",
            LastName = "Who",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        await context.StaffMembers.AddAsync(doctor);

        // Queue item has DoctorId set (consultation origin)
        var queueItem = new QueueItem
        {
            Id = queueItemId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientName = "Origin Consult Patient",
            QueueNumber = "Q-404",
            DoctorId = doctorId,
            Status = QueueStatus.PendingProcedure
        };
        await context.QueueItems.AddAsync(queueItem);

        var procedure = new Procedure
        {
            Id = procedureId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Origin Consult Patient",
            Category = "Nursing Procedures",
            QueueItemId = queueItemId,
            ProcedureName = "Nebulization Therapy",
            OrderedByDoctorId = doctorId,
            Status = ProcedureStatus.Ordered
        };
        await context.Procedures.AddAsync(procedure);
        await context.SaveChangesAsync();

        var handler = new RecordProcedureExecutionCommandHandler(
            procRepo,
            uow,
            clinicContext,
            queueRepo,
            staffRepo);

        // RequiresDoctorReEvaluation is null -> should resolve to true because DoctorId is set
        var command = new RecordProcedureExecutionCommand(
            ProcedureId: procedureId,
            RequiresDoctorReEvaluation: null);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be(ProcedureStatus.Completed);

        var updatedQueue = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == queueItemId);
        updatedQueue.Should().NotBeNull();
        updatedQueue!.Status.Should().Be(QueueStatus.ReEvaluation);
    }

    [Fact]
    public async Task Probe_RecordProcedure_NonExistentProcedureId_ThrowsNotFoundException()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var handler = new RecordProcedureExecutionCommandHandler(
            procRepo,
            uow,
            clinicContext);

        var command = new RecordProcedureExecutionCommand(ProcedureId: Guid.NewGuid());

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>()
            .WithMessage("*not found*");
    }

    #endregion

    #region Group 3: AdministerVaccineCommand Auto-Discharge Probes

    [Fact]
    public async Task Probe_AdministerVaccine_CompleteVisitTrue_DischargesQueueItemToDischargedNonDoctor()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var publisher = Substitute.For<IImmunizationEventPublisher>();

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();
        var nurseId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = patientId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientCode = "PAT-VAX-01",
            FirstName = "Baby",
            LastName = "Girl",
            ContactNumber = "09123456789"
        };
        await context.Patients.AddAsync(patient);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = patientId,
            PatientName = "Baby Girl",
            QueueNumber = "Q-VAX-01",
            Status = QueueStatus.Triaged
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var handler = new AdministerVaccineCommandHandler(
            patientRepo,
            immRepo,
            uow,
            clinicContext,
            publisher,
            queueRepo);

        var command = new AdministerVaccineCommand(
            PatientId: patientId,
            ConsultationEncounterId: null,
            PhilHealthLibrary: "lib_immchild",
            PhilHealthCode: "C02",
            VaccineName: "Hepatitis B",
            BrandName: "Engerix-B",
            Manufacturer: "GSK",
            LotBatchNumber: "LOT-HEP-99",
            ExpirationDate: DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(12)),
            DoseSequence: 1,
            IsSeriesCompleted: false,
            Route: "Intramuscular (IM)",
            InjectionSite: "Anterolateral Thigh",
            AdministeredAtUtc: DateTime.UtcNow,
            AdministeredByStaffId: nurseId,
            AdministeredByStaffName: "Nurse Nancy",
            AdministeredByPrcLicense: "PRC-NURSE-01",
            Remarks: "First dose administered without event",
            QueueItemId: queueItemId,
            CompleteVisit: true);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.VaccineName.Should().Be("Hepatitis B");

        var updatedQueue = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == queueItemId);
        updatedQueue.Should().NotBeNull();
        updatedQueue!.Status.Should().Be(QueueStatus.DischargedNonDoctor);
        updatedQueue.CompletedTime.Should().NotBeNull();
        updatedQueue.DischargedAt.Should().NotBeNull();
        updatedQueue.DischargedByStaffId.Should().Be(nurseId);
        updatedQueue.DischargeNotes.Should().Be("First dose administered without event");
    }

    [Fact]
    public async Task Probe_AdministerVaccine_CompleteVisitFalse_LeavesQueueStatusUntouched()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var publisher = Substitute.For<IImmunizationEventPublisher>();

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();
        var nurseId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = patientId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientCode = "PAT-VAX-02",
            FirstName = "Baby",
            LastName = "Boy",
            ContactNumber = "09123456789"
        };
        await context.Patients.AddAsync(patient);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = patientId,
            PatientName = "Baby Boy",
            QueueNumber = "Q-VAX-02",
            Status = QueueStatus.Waiting
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var handler = new AdministerVaccineCommandHandler(
            patientRepo,
            immRepo,
            uow,
            clinicContext,
            publisher,
            queueRepo);

        // CompleteVisit is FALSE (patient might still have consultation or lab afterward)
        var command = new AdministerVaccineCommand(
            PatientId: patientId,
            ConsultationEncounterId: null,
            PhilHealthLibrary: "lib_immchild",
            PhilHealthCode: "C03",
            VaccineName: "Pentavalent",
            BrandName: "Easyfive",
            Manufacturer: "Panacea",
            LotBatchNumber: "LOT-PENTA-10",
            ExpirationDate: DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(6)),
            DoseSequence: 1,
            IsSeriesCompleted: false,
            Route: "Intramuscular (IM)",
            InjectionSite: "Anterolateral Thigh",
            AdministeredAtUtc: DateTime.UtcNow,
            AdministeredByStaffId: nurseId,
            AdministeredByStaffName: "Nurse Nancy",
            AdministeredByPrcLicense: null,
            Remarks: "Vaccine given; proceeding to doctor consult",
            QueueItemId: queueItemId,
            CompleteVisit: false);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();

        var updatedQueue = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == queueItemId);
        updatedQueue.Should().NotBeNull();
        updatedQueue!.Status.Should().Be(QueueStatus.Waiting);
        updatedQueue.CompletedTime.Should().BeNull();
        updatedQueue.DischargedAt.Should().BeNull();
    }

    [Fact]
    public async Task Probe_AdministerVaccine_CompleteVisitTrue_WhenQueueAlreadyCompleted_DoesNotOverwriteStatus()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var publisher = Substitute.For<IImmunizationEventPublisher>();

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = patientId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientCode = "PAT-VAX-03",
            FirstName = "Senior",
            LastName = "Citizen",
            ContactNumber = "09123456789"
        };
        await context.Patients.AddAsync(patient);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = patientId,
            PatientName = "Senior Citizen",
            QueueNumber = "Q-VAX-03",
            Status = QueueStatus.Completed
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var handler = new AdministerVaccineCommandHandler(
            patientRepo,
            immRepo,
            uow,
            clinicContext,
            publisher,
            queueRepo);

        var command = new AdministerVaccineCommand(
            PatientId: patientId,
            ConsultationEncounterId: null,
            PhilHealthLibrary: "lib_immelderly",
            PhilHealthCode: "E01",
            VaccineName: "Pneumococcal Polysaccharide (PPSV23)",
            BrandName: "Pneumovax 23",
            Manufacturer: "MSD",
            LotBatchNumber: "LOT-PNEUMO-01",
            ExpirationDate: DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(12)),
            DoseSequence: 1,
            IsSeriesCompleted: true,
            Route: "Intramuscular (IM)",
            InjectionSite: "Left Deltoid",
            AdministeredAtUtc: DateTime.UtcNow,
            AdministeredByStaffId: Guid.NewGuid(),
            AdministeredByStaffName: "Nurse Nancy",
            AdministeredByPrcLicense: null,
            Remarks: "Elderly dose",
            QueueItemId: queueItemId,
            CompleteVisit: true);

        await handler.Handle(command, CancellationToken.None);

        var recheckedQueue = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == queueItemId);
        recheckedQueue.Should().NotBeNull();
        recheckedQueue!.Status.Should().Be(QueueStatus.Completed); // Kept Completed, not overwritten
    }

    [Fact]
    public void Probe_AdministerVaccine_ExpiredBatch_ValidatorBlocksAdministration()
    {
        var validator = new AdministerVaccineValidator();

        var expiredDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-5));

        var command = new AdministerVaccineCommand(
            PatientId: Guid.NewGuid(),
            ConsultationEncounterId: null,
            PhilHealthLibrary: "lib_immchild",
            PhilHealthCode: "C01",
            VaccineName: "BCG",
            BrandName: null,
            Manufacturer: null,
            LotBatchNumber: "LOT-EXPIRED",
            ExpirationDate: expiredDate,
            DoseSequence: 1,
            IsSeriesCompleted: true,
            Route: "Intradermal (ID)",
            InjectionSite: "Right Deltoid",
            AdministeredAtUtc: DateTime.UtcNow,
            AdministeredByStaffId: Guid.NewGuid(),
            AdministeredByStaffName: "Nurse Joy",
            AdministeredByPrcLicense: null,
            Remarks: null);

        var result = validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("Cannot administer expired vaccine batch."));
    }

    #endregion

    #region Group 4: Treatment Bay & Room Resolution Probes

    [Fact]
    public async Task Probe_OrderProcedure_TreatmentBay_AutoResolvesActiveTreatmentRoom_WhenTargetNotSpecified()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(context, sieve);

        var roomConsultation = new Room
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Name = "Room 101 (Doctor)",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 1,
            IsActive = true
        };
        var roomTreatment = new Room
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Name = "Treatment Bay Alpha",
            Type = ClinicRoomType.Treatment,
            DisplayOrder = 2,
            IsActive = true
        };
        await context.Rooms.AddRangeAsync(roomConsultation, roomTreatment);

        var serviceItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Code = "PROC-NEB",
            Name = "Nebulization Therapy",
            Category = "Nursing Procedures",
            IsNurseOrderable = true,
            IsActive = true
        };
        await context.ServiceItems.AddAsync(serviceItem);
        await context.SaveChangesAsync();

        var handler = new OrderProcedureCommandHandler(
            procRepo,
            uow,
            clinicContext,
            queueRepo: null,
            roomRepo: roomRepo,
            serviceRepo: serviceRepo);

        // Target room omitted
        var command = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Asthmatic Patient",
            ProcedureCode: "PROC-NEB",
            ProcedureName: "Nebulization Therapy");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.TargetRoomId.Should().Be(roomTreatment.Id);
        result.TargetRoomName.Should().Be("Treatment Bay Alpha");
    }

    #endregion
}
