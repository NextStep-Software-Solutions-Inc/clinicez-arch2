using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Immunizations.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.Procedures.Commands;
using ClinicEz.Clinic.Application.Features.Procedures.DTOs;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Common;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Procedures;

public class NonDoctorWorkflowsMilestone4Tests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_m4_test";
    private readonly Guid _staffId = Guid.NewGuid();

    public NonDoctorWorkflowsMilestone4Tests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
    }

    #region F16 & F22: Catalog Seeding & RBAC Permissions

    [Fact]
    public void CanonicalRoleTemplates_ContainMilestone4NurseLabPermissions()
    {
        var templates = ClinicRoleSeeder.GetCanonicalSystemRoleTemplates();
        var nurse = templates.SingleOrDefault(t => t.Name == ClinicRoleSeeder.NurseRoleName);

        nurse.Should().NotBeNull();
        nurse!.Permissions.Should().Contain(ClinicPermissions.LabOrdersRead);
        nurse.Permissions.Should().Contain(ClinicPermissions.LabOrdersWrite);
        nurse.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor);
    }

    [Fact]
    public void GeneralMedicalCatalogDefaults_FlagExpectedProceduresAsNurseOrderable()
    {
        var items = GeneralMedicalCatalogDefaults.CreateDefaults(_tenantId, _clinicId);

        var neb = items.FirstOrDefault(i => i.Code == "PROC-NEB");
        neb.Should().NotBeNull();
        neb!.IsNurseOrderable.Should().BeTrue();

        var wound = items.FirstOrDefault(i => i.Code == "PROC-WOUND");
        wound.Should().NotBeNull();
        wound!.IsNurseOrderable.Should().BeTrue();

        var vax = items.FirstOrDefault(i => i.Code == "PROC-VAX");
        vax.Should().NotBeNull();
        vax!.IsNurseOrderable.Should().BeTrue();

        var rbs = items.FirstOrDefault(i => i.Code == "LAB-RBS");
        rbs.Should().NotBeNull();
        rbs!.IsNurseOrderable.Should().BeTrue();

        var consult = items.FirstOrDefault(i => i.Code == "CONS-GEN");
        consult.Should().NotBeNull();
        consult!.IsNurseOrderable.Should().BeFalse();
    }

    #endregion

    #region F17: OrderProcedureCommand Gating

    [Fact]
    public async Task OrderProcedure_WhenOrderedByNurse_ForNurseOrderableProcedure_Succeeds()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);

        var serviceItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            Code = "PROC-NEB",
            Name = "Nebulization Therapy",
            Category = "Nursing Procedures",
            IsNurseOrderable = true,
            IsActive = true
        };
        await db.ServiceItems.AddAsync(serviceItem);
        await db.SaveChangesAsync();

        var handler = new OrderProcedureCommandHandler(
            procRepo,
            unitOfWork,
            _clinicContext,
            queueRepo,
            roomRepo: null,
            serviceRepo: serviceRepo,
            staffRepo: staffRepo);

        var command = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Ambulatory Patient",
            ProcedureCode: "PROC-NEB",
            ProcedureName: "Nebulization Therapy",
            Category: "Nursing Procedures",
            TargetRoomName: "Treatment Bay 1");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.ProcedureName.Should().Be("Nebulization Therapy");
        result.TargetRoomName.Should().Be("Treatment Bay 1");

        var persisted = await db.Procedures.FirstOrDefaultAsync(p => p.Id == result.Id);
        persisted.Should().NotBeNull();
        persisted!.TargetRoomName.Should().Be("Treatment Bay 1");
    }

    [Fact]
    public async Task OrderProcedure_WhenOrderedByNurse_ForNonNurseOrderableProcedure_ThrowsBadRequestException()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);

        var serviceItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            Code = "PROC-EXCISE",
            Name = "Minor Cyst Excision",
            Category = "Minor Surgery",
            IsNurseOrderable = false,
            IsActive = true
        };
        await db.ServiceItems.AddAsync(serviceItem);
        await db.SaveChangesAsync();

        var handler = new OrderProcedureCommandHandler(
            procRepo,
            unitOfWork,
            _clinicContext,
            queueRepo,
            roomRepo: null,
            serviceRepo: serviceRepo,
            staffRepo: staffRepo);

        var command = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Patient One",
            ProcedureCode: "PROC-EXCISE",
            ProcedureName: "Minor Cyst Excision",
            Category: "Minor Surgery");

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Only procedures flagged as nurse-orderable*");
    }

    [Fact]
    public async Task OrderProcedure_WhenOrderedByDoctorWithVerifiedPrc_SucceedsEvenIfNotNurseOrderable()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);

        var doctorId = Guid.NewGuid();
        var doctorStaff = new StaffMember
        {
            Id = doctorId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Gregory",
            LastName = "House",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-998877",
            IsActive = true
        };
        await db.StaffMembers.AddAsync(doctorStaff);

        var serviceItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            Code = "PROC-EXCISE",
            Name = "Minor Cyst Excision",
            Category = "Minor Surgery",
            IsNurseOrderable = false,
            IsActive = true
        };
        await db.ServiceItems.AddAsync(serviceItem);
        await db.SaveChangesAsync();

        var handler = new OrderProcedureCommandHandler(
            procRepo,
            unitOfWork,
            _clinicContext,
            queueRepo,
            roomRepo: null,
            serviceRepo: serviceRepo,
            staffRepo: staffRepo);

        var command = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Patient One",
            ProcedureCode: "PROC-EXCISE",
            ProcedureName: "Minor Cyst Excision",
            Category: "Minor Surgery",
            OrderedByDoctorId: doctorId,
            OrderedByDoctorName: "Dr. Gregory House");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.OrderedByDoctorId.Should().Be(doctorId);
    }

    #endregion

    #region F18: RecordProcedureExecutionCommand Routing & Auto-Discharge

    [Fact]
    public async Task RecordProcedureExecution_WhenRequiresDoctorReEvaluationIsFalse_DischargesToDischargedNonDoctor()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);

        var queueItemId = Guid.NewGuid();
        var procedureId = Guid.NewGuid();
        var nurseStaffId = Guid.NewGuid();

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientName = "Walk-in Patient",
            QueueNumber = "Q-101",
            Status = QueueStatus.PendingProcedure,
            RoomOrStation = "Treatment Bay 2",
            DoctorId = null
        };
        await db.QueueItems.AddAsync(queueItem);

        var procedure = new Procedure
        {
            Id = procedureId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Walk-in Patient",
            Category = "Nursing Procedures",
            QueueItemId = queueItemId,
            ProcedureName = "Nebulization Therapy",
            Status = ProcedureStatus.Ordered,
            TargetRoomName = "Treatment Bay 2"
        };
        await db.Procedures.AddAsync(procedure);
        await db.SaveChangesAsync();

        var handler = new RecordProcedureExecutionCommandHandler(
            procRepo,
            unitOfWork,
            _clinicContext,
            queueRepo);

        var command = new RecordProcedureExecutionCommand(
            ProcedureId: procedureId,
            PerformedByStaffId: nurseStaffId,
            PerformedByStaffName: "Nurse Florence",
            RequiresDoctorReEvaluation: false,
            ClinicalNotes: "Tolerated well without dyspnea.");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.Status.Should().Be(ProcedureStatus.Completed);

        var updatedQueue = await db.QueueItems.FirstOrDefaultAsync(q => q.Id == queueItemId);
        updatedQueue.Should().NotBeNull();
        updatedQueue!.Status.Should().Be(QueueStatus.DischargedNonDoctor);
        updatedQueue.CompletedTime.Should().NotBeNull();
        updatedQueue.DischargedAt.Should().NotBeNull();
        updatedQueue.DischargedByStaffId.Should().Be(nurseStaffId);
        updatedQueue.RoomOrStation.Should().Be("Treatment Bay 2");
        updatedQueue.DischargeNotes.Should().Be("Tolerated well without dyspnea.");
    }

    [Fact]
    public async Task RecordProcedureExecution_WhenRequiresDoctorReEvaluationIsTrue_RoutesToReEvaluation()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var roomRepo = TestDbHelper.CreateRepository<Room>(db, sieve);

        var queueItemId = Guid.NewGuid();
        var procedureId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var room = new Room
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            Name = "Room 102",
            DisplayOrder = 1,
            IsActive = true
        };
        await db.Rooms.AddAsync(room);

        var doctor = new StaffMember
        {
            Id = doctorId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Doctor",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            IsActive = true,
            AssignedRoomIdsJson = $"[\"{room.Id}\"]"
        };
        await db.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientName = "Walk-in Patient",
            QueueNumber = "Q-102",
            DoctorId = doctorId,
            Status = QueueStatus.PendingProcedure,
            RoomOrStation = "Treatment Bay 1"
        };
        await db.QueueItems.AddAsync(queueItem);

        var procedure = new Procedure
        {
            Id = procedureId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Walk-in Patient",
            Category = "Nursing Procedures",
            QueueItemId = queueItemId,
            ProcedureName = "Wound Dressing",
            OrderedByDoctorId = doctorId,
            Status = ProcedureStatus.Ordered,
            TargetRoomName = "Treatment Bay 1"
        };
        await db.Procedures.AddAsync(procedure);
        await db.SaveChangesAsync();

        var handler = new RecordProcedureExecutionCommandHandler(
            procRepo,
            unitOfWork,
            _clinicContext,
            queueRepo,
            staffRepo,
            roomRepo);

        var command = new RecordProcedureExecutionCommand(
            ProcedureId: procedureId,
            PerformedByStaffId: Guid.NewGuid(),
            PerformedByStaffName: "Nurse Nightingale",
            RequiresDoctorReEvaluation: true);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be(ProcedureStatus.Completed);

        var updatedQueue = await db.QueueItems.FirstOrDefaultAsync(q => q.Id == queueItemId);
        updatedQueue.Should().NotBeNull();
        updatedQueue!.Status.Should().Be(QueueStatus.ReEvaluation);
        updatedQueue.RoomOrStation.Should().Be("Room 102");
        updatedQueue.RoomId.Should().Be(room.Id);
    }

    #endregion

    #region F20: AdministerVaccineCommand Auto-Discharge

    [Fact]
    public async Task AdministerVaccine_WithCompleteVisitTrue_DischargesQueueItemToDischargedNonDoctor()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var publisher = Substitute.For<IImmunizationEventPublisher>();

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();
        var nurseId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = patientId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientCode = "PAT-201",
            FirstName = "Baby",
            LastName = "Santos",
            ContactNumber = "09123456789"
        };
        await db.Patients.AddAsync(patient);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patientId,
            PatientName = "Baby Santos",
            QueueNumber = "Q-201",
            Status = QueueStatus.Waiting
        };
        await db.QueueItems.AddAsync(queueItem);
        await db.SaveChangesAsync();

        var handler = new AdministerVaccineCommandHandler(
            patientRepo,
            immRepo,
            unitOfWork,
            _clinicContext,
            publisher,
            queueRepo);

        var command = new AdministerVaccineCommand(
            PatientId: patientId,
            ConsultationEncounterId: null,
            PhilHealthLibrary: "lib_immchild",
            PhilHealthCode: "C01",
            VaccineName: "BCG",
            BrandName: null,
            Manufacturer: null,
            LotBatchNumber: "LOT-BCG-1234",
            ExpirationDate: new DateOnly(2028, 12, 31),
            DoseSequence: 1,
            IsSeriesCompleted: true,
            Route: "Intradermal (ID)",
            InjectionSite: "Right Deltoid",
            AdministeredAtUtc: DateTime.UtcNow,
            AdministeredByStaffId: nurseId,
            AdministeredByStaffName: "Nurse Joy",
            AdministeredByPrcLicense: null,
            Remarks: null,
            QueueItemId: queueItemId,
            CompleteVisit: true);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();

        var updatedQueue = await db.QueueItems.FirstOrDefaultAsync(q => q.Id == queueItemId);
        updatedQueue.Should().NotBeNull();
        updatedQueue!.Status.Should().Be(QueueStatus.DischargedNonDoctor);
        updatedQueue.CompletedTime.Should().NotBeNull();
        updatedQueue.DischargedAt.Should().NotBeNull();
        updatedQueue.DischargedByStaffId.Should().Be(nurseId);
        updatedQueue.DischargeNotes.Should().Contain("Discharged following vaccine administration: BCG");
    }

    #endregion

    #region F22: CreateClinicLabOrderCommand Nurse Gate & Routed Doctor Mandate

    private CreateClinicLabOrderCommandHandler NewLabOrderHandler(
        ApplicationDbContext db,
        ISieveProcessor sieve,
        IUnitOfWork unitOfWork,
        IRepository<ServiceItem>? serviceRepo = null)
    {
        var orderRepo = TestDbHelper.CreateRepository<LabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);

        return new CreateClinicLabOrderCommandHandler(
            orderRepo,
            patientRepo,
            staffRepo,
            unitOfWork,
            _clinicContext,
            Phase3TestKit.Identity(_clinicId, _tenantId),
            new LabRequisitionPublisher(new InteropPublisher(db)),
            Phase3TestKit.Grants(db),
            Phase3TestKit.Claims(null),
            Phase3TestKit.Documents(db),
            serviceRepo);
    }

    [Fact]
    public async Task CreateLabOrder_WhenNurseOrdersInHouse_WithNurseOrderableTest_Succeeds()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(db, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientCode = "PAT-301",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09123456789"
        };
        await db.Patients.AddAsync(patient);

        var serviceItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            Code = "LAB-RBS",
            Name = "Random Blood Sugar (RBS)",
            Category = "Clinical Chemistry",
            IsNurseOrderable = true,
            IsActive = true
        };
        await db.ServiceItems.AddAsync(serviceItem);
        await db.SaveChangesAsync();

        var handler = NewLabOrderHandler(db, sieve, unitOfWork, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patientId,
            PatientName: "Juan Dela Cruz",
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Random Blood Sugar (RBS)", "Clinical Chemistry", null)
            });

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.Status.Should().Be(LabOrderStatus.Ordered);

        var persistedOrder = await db.LabOrders.FirstOrDefaultAsync(o => o.Id == result.Id);
        persistedOrder.Should().NotBeNull();
        persistedOrder!.TargetTenantId.Should().BeNull();
        persistedOrder.TargetFacilityId.Should().BeNull();
    }

    [Fact]
    public async Task CreateLabOrder_WhenNurseOrdersInHouse_WithNonNurseOrderableTest_ThrowsBadRequestException()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(db, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientCode = "PAT-302",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09123456789"
        };
        await db.Patients.AddAsync(patient);

        var serviceItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            Code = "LAB-BIOPSY",
            Name = "Bone Marrow Biopsy",
            Category = "Pathology",
            IsNurseOrderable = false,
            IsActive = true
        };
        await db.ServiceItems.AddAsync(serviceItem);
        await db.SaveChangesAsync();

        var handler = NewLabOrderHandler(db, sieve, unitOfWork, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patientId,
            PatientName: "Juan Dela Cruz",
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Bone Marrow Biopsy", "Pathology", null)
            });

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Only laboratory tests flagged as nurse-orderable*");
    }

    [Fact]
    public async Task CreateLabOrder_WhenRoutedExternal_WithoutDoctor_ThrowsBadRequestException()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(db, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientCode = "PAT-303",
            FirstName = "Outer",
            LastName = "Patient",
            ContactNumber = "09123456789"
        };
        await db.Patients.AddAsync(patient);

        var serviceItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            Code = "LAB-RBS",
            Name = "Random Blood Sugar (RBS)",
            Category = "Clinical Chemistry",
            IsNurseOrderable = true,
            IsActive = true
        };
        await db.ServiceItems.AddAsync(serviceItem);
        await db.SaveChangesAsync();

        var handler = NewLabOrderHandler(db, sieve, unitOfWork, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patientId,
            PatientName: "Outer Patient",
            TargetTenantId: "external-lab-tenant-01",
            TargetFacilityId: Guid.NewGuid().ToString(),
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Random Blood Sugar (RBS)", "Clinical Chemistry", null)
            });

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*OrderedByDoctorId is required to route a lab order to a laboratory.*");
    }

    [Fact]
    public async Task CreateLabOrder_WhenRoutedExternal_WithDoctorWithoutPrcLicense_ThrowsBadRequestException()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ServiceItem>(db, sieve);

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientCode = "PAT-304",
            FirstName = "Outer",
            LastName = "Patient",
            ContactNumber = "09123456789"
        };
        await db.Patients.AddAsync(patient);

        var doctorNoPrc = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Doctor",
            LastName = "NoLicense",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = null,
            IsActive = true
        };
        await db.StaffMembers.AddAsync(doctorNoPrc);

        var serviceItem = new ServiceItem
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            Code = "LAB-RBS",
            Name = "Random Blood Sugar (RBS)",
            Category = "Clinical Chemistry",
            IsNurseOrderable = true,
            IsActive = true
        };
        await db.ServiceItems.AddAsync(serviceItem);
        await db.SaveChangesAsync();

        var handler = NewLabOrderHandler(db, sieve, unitOfWork, serviceRepo);

        var command = new CreateClinicLabOrderCommand(
            PatientId: patientId,
            PatientName: "Outer Patient",
            OrderedByDoctorId: doctorNoPrc.Id,
            TargetTenantId: "external-lab-tenant-01",
            TargetFacilityId: Guid.NewGuid().ToString(),
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Random Blood Sugar (RBS)", "Clinical Chemistry", null)
            });

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*The ordering doctor has no PRC license number on file*");
    }

    #endregion
}
