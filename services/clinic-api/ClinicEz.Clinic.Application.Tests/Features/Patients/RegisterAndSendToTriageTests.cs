using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class RegisterAndSendToTriageTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_triage_test";

    public RegisterAndSendToTriageTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task Handle_SendToTriageTrue_CreatesQueueItemInWaitingStatusWithSequentialTicket()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext, queueRepo: queueRepo);

        var command1 = new RegisterClinicPatientCommand(
            FirstName: "Jose",
            LastName: "Manalo",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1975, 2, 14),
            Sex: "Male",
            CivilStatus: null,
            ContactNumber: "09171112222",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            SendToTriage: true,
            Priority: "Urgent",
            ChiefComplaint: "High blood pressure and dizziness"
        );

        // Act - Patient 1
        var result1 = await handler.Handle(command1, CancellationToken.None);

        // Assert - Patient 1
        result1.ActiveQueueTicket.Should().Be("Q-001");
        result1.ActiveQueueItemId.Should().NotBeNull();

        var queueItem1 = await queueRepo.Query(q => q.Id == result1.ActiveQueueItemId!.Value).FirstOrDefaultAsync();
        queueItem1.Should().NotBeNull();
        queueItem1!.QueueNumber.Should().Be("Q-001");
        queueItem1.SequenceNumber.Should().Be(1);
        queueItem1.Status.Should().Be(QueueStatus.Waiting, "Must route to nursing triage queue");
        queueItem1.Priority.Should().Be(QueuePriority.Urgent);
        queueItem1.ChiefComplaint.Should().Be("High blood pressure and dizziness");

        // Act - Patient 2 on same day
        var command2 = new RegisterClinicPatientCommand(
            FirstName: "Wally",
            LastName: "Bayola",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1972, 5, 3),
            Sex: "Male",
            CivilStatus: null,
            ContactNumber: "09173334444",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            SendToTriage: true,
            Priority: "Normal",
            ChiefComplaint: "Routine consult"
        );

        var result2 = await handler.Handle(command2, CancellationToken.None);

        // Assert - Patient 2 gets Q-002
        result2.ActiveQueueTicket.Should().Be("Q-002");
        result2.ActiveQueueItemId.Should().NotBeNull();

        var queueItem2 = await queueRepo.Query(q => q.Id == result2.ActiveQueueItemId!.Value).FirstOrDefaultAsync();
        queueItem2.Should().NotBeNull();
        queueItem2!.QueueNumber.Should().Be("Q-002");
        queueItem2.SequenceNumber.Should().Be(2);
        queueItem2.Status.Should().Be(QueueStatus.Waiting);
        queueItem2.Priority.Should().Be(QueuePriority.Routine);
    }

    [Fact]
    public async Task Handle_SendToTriageFalse_DoesNotCreateQueueItem()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext, queueRepo: queueRepo);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Vic",
            LastName: "Sotto",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1954, 4, 28),
            Sex: "Male",
            CivilStatus: null,
            ContactNumber: "09170009999",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            SendToTriage: false
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.ActiveQueueTicket.Should().BeNull();
        result.ActiveQueueItemId.Should().BeNull();

        var queueCount = await queueRepo.Query().CountAsync();
        queueCount.Should().Be(0);
    }

    [Fact]
    public async Task Handle_SendToTriageTrue_WithDoctorAndRoom_AssignsDoctorAndRoomToQueueItem()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);

        var doctorId = Guid.NewGuid();
        var roomId = Guid.NewGuid();

        var doctor = new StaffMember
        {
            Id = doctorId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Maria",
            LastName = "Santos",
            Title = "Dr.",
            Role = StaffRole.Doctor,
            Email = "santos@clinic.local",
            PhoneNumber = "09171234567"
        };
        doctor.SetAssignedRoomIds(new List<Guid> { roomId });
        await staffRepo.AddAsync(doctor);

        var room = new Room
        {
            Id = roomId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Name = "Exam Room 1",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 1,
            IsActive = true
        };
        await roomRepo.AddAsync(room);
        await uow.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(
            patientRepo,
            uow,
            _clinicContext,
            queueRepo: queueRepo,
            staffRepo: staffRepo,
            roomRepo: roomRepo);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Ana",
            LastName: "Reyes",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1990, 1, 1),
            Sex: "Female",
            CivilStatus: null,
            ContactNumber: "09181112222",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            SendToTriage: true,
            DoctorId: doctorId,
            RoomId: roomId
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.ActiveQueueTicket.Should().Be("Q-001");
        result.ActiveQueueItemId.Should().NotBeNull();

        var queueItem = await queueRepo.Query(q => q.Id == result.ActiveQueueItemId!.Value).FirstOrDefaultAsync();
        queueItem.Should().NotBeNull();
        queueItem!.DoctorId.Should().Be(doctorId);
        queueItem.DoctorName.Should().Be("Dr. Maria Santos");
        queueItem.RoomId.Should().Be(roomId);
        queueItem.RoomOrStation.Should().Be("Exam Room 1");
    }

    [Fact]
    public async Task Handle_SendToTriageTrue_SeniorCitizenByAge_GeneratesPriorityTicketSQ001()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext, queueRepo: queueRepo);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var seniorDob = today.AddYears(-72); // 72 years old

        var command = new RegisterClinicPatientCommand(
            FirstName: "Eduardo",
            LastName: "Dela Cruz",
            MiddleName: "Santos",
            Suffix: "Sr.",
            DateOfBirth: seniorDob,
            Sex: "Male",
            CivilStatus: "Married",
            ContactNumber: "+639171234567",
            Email: null,
            AddressLine: "123 Mabini St",
            Barangay: "Barangay 1",
            City: "Manila",
            Province: "Metro Manila",
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            SendToTriage: true,
            Priority: "Routine",
            ChiefComplaint: "Routine check-up",
            QueueDate: today
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.ActiveQueueTicket.Should().Be("SQ-001");
        result.ActiveQueueItemId.Should().NotBeNull();

        var queueItem = await queueRepo.Query(q => q.Id == result.ActiveQueueItemId!.Value).FirstOrDefaultAsync();
        queueItem.Should().NotBeNull();
        queueItem!.QueueNumber.Should().Be("SQ-001");
        queueItem.SequenceNumber.Should().Be(1);
        queueItem.Status.Should().Be(QueueStatus.Waiting);
    }

    [Fact]
    public async Task Handle_SendToTriageTrue_SeniorCitizenById_GeneratesPriorityTicketSQ001()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext, queueRepo: queueRepo);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var nonSeniorDob = today.AddYears(-45); // 45 years old, but with OSCA Senior ID

        var command = new RegisterClinicPatientCommand(
            FirstName: "Carlos",
            LastName: "Tan",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: nonSeniorDob,
            Sex: "Male",
            CivilStatus: null,
            ContactNumber: "09171112233",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: "OSCA-MNL-2014-9982",
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            SendToTriage: true,
            Priority: "Routine",
            ChiefComplaint: "Consultation",
            QueueDate: today
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.ActiveQueueTicket.Should().Be("SQ-001");
        var queueItem = await queueRepo.Query(q => q.Id == result.ActiveQueueItemId!.Value).FirstOrDefaultAsync();
        queueItem.Should().NotBeNull();
        queueItem!.QueueNumber.Should().Be("SQ-001");
    }

    [Fact]
    public async Task Handle_SendToTriageTrue_PwdById_GeneratesPriorityTicketSQ001()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext, queueRepo: queueRepo);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var youngDob = today.AddYears(-25); // 25 years old with PWD ID

        var command = new RegisterClinicPatientCommand(
            FirstName: "Maria",
            LastName: "Santos",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: youngDob,
            Sex: "Female",
            CivilStatus: null,
            ContactNumber: "09174445566",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: "PWD-MNL-2024-5555",
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            SendToTriage: true,
            Priority: "Routine",
            ChiefComplaint: "PWD Consultation",
            QueueDate: today
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.ActiveQueueTicket.Should().Be("SQ-001");
        var queueItem = await queueRepo.Query(q => q.Id == result.ActiveQueueItemId!.Value).FirstOrDefaultAsync();
        queueItem.Should().NotBeNull();
        queueItem!.QueueNumber.Should().Be("SQ-001");
    }

    [Fact]
    public async Task Handle_SendToTriageTrue_InterleavedSeries_SequenceIsolation()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext, queueRepo: queueRepo);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Pre-seed tickets in other series: Q-001, Q-002, A-001, DV-001 (total 4 tickets across clinic)
        await queueRepo.AddAsync(new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Regular Pat 1"
        });
        await queueRepo.AddAsync(new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Regular Pat 2"
        });
        await queueRepo.AddAsync(new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "A-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Admin Pat 1"
        });
        await queueRepo.AddAsync(new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "DV-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Direct Visit Pat 1"
        });
        await uow.SaveChangesAsync();

        // Act 1: Register Senior patient (DOB 70 years ago) -> sequence MUST isolate to SQ-001 (not SQ-005 or Q-003)
        var seniorCommand1 = new RegisterClinicPatientCommand(
            FirstName: "Lola",
            LastName: "Remedios",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: today.AddYears(-70),
            Sex: "Female",
            CivilStatus: null,
            ContactNumber: "09170001111",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            SendToTriage: true,
            QueueDate: today
        );
        var seniorResult1 = await handler.Handle(seniorCommand1, CancellationToken.None);
        seniorResult1.ActiveQueueTicket.Should().Be("SQ-001");

        // Act 2: Register second Senior patient -> must be SQ-002
        var seniorCommand2 = new RegisterClinicPatientCommand(
            FirstName: "Lolo",
            LastName: "Domingo",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: today.AddYears(-65),
            Sex: "Male",
            CivilStatus: null,
            ContactNumber: "09170002222",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            SendToTriage: true,
            QueueDate: today
        );
        var seniorResult2 = await handler.Handle(seniorCommand2, CancellationToken.None);
        seniorResult2.ActiveQueueTicket.Should().Be("SQ-002");

        // Act 3: Register third patient who is NOT senior -> must continue Q series at Q-003
        var regularCommand = new RegisterClinicPatientCommand(
            FirstName: "Juan",
            LastName: "Cruz",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: today.AddYears(-20),
            Sex: "Male",
            CivilStatus: null,
            ContactNumber: "09170003333",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            SendToTriage: true,
            QueueDate: today
        );
        var regularResult = await handler.Handle(regularCommand, CancellationToken.None);
        regularResult.ActiveQueueTicket.Should().Be("Q-003");
    }
}
