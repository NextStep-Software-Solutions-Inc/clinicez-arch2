using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Allergies.Dtos;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class PatientCodeSequenceTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_seq_test";
    private readonly IClinicContext _clinicContext;

    public PatientCodeSequenceTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task RegisterPatient_WithSoftDeletedPatient_DoesNotCollideWithSoftDeletedCode()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        // Add Active patient PAT-YYYY-00001
        var activePatient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00001",
            FirstName = "Alice",
            LastName = "Smith",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Female",
            ContactNumber = "09170000001",
            IsDeleted = false,
            CreatedAt = DateTime.UtcNow
        };
        await context.Patients.AddAsync(activePatient);

        // Add Soft-deleted patient PAT-YYYY-00002 (IsDeleted = true)
        var softDeletedPatient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00002",
            FirstName = "Bob",
            LastName = "Jones",
            DateOfBirth = new DateOnly(1985, 5, 5),
            Gender = "Male",
            ContactNumber = "09170000002",
            IsDeleted = true,
            CreatedAt = DateTime.UtcNow
        };
        await context.Patients.AddAsync(softDeletedPatient);
        await context.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Charlie",
            LastName: "Brown",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 3, 10),
            Gender: "Male",
            CivilStatus: null,
            ContactNumber: "09170000003",
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
            Alerts: null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Next code must be PAT-YYYY-00003, avoiding collision with soft-deleted PAT-YYYY-00002
        result.Should().NotBeNull();
        result.PatientCode.Should().Be($"PAT-{year}-00003");

        var created = await context.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Id == result.Id);
        created.Should().NotBeNull();
        created!.PatientCode.Should().Be($"PAT-{year}-00003");
    }

    [Fact]
    public async Task BulkRegisterPatients_WithSoftDeletedPatient_AssignsContiguousSequenceAvoidingCollisions()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        // Add Active patient PAT-YYYY-00001
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00001",
            FirstName = "First",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Female",
            ContactNumber = "09171110001",
            IsDeleted = false,
            CreatedAt = DateTime.UtcNow
        });

        // Add Soft-deleted patient PAT-YYYY-00002
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00002",
            FirstName = "Second",
            LastName = "Deleted",
            DateOfBirth = new DateOnly(1991, 2, 2),
            Gender = "Male",
            ContactNumber = "09171110002",
            IsDeleted = true,
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new BulkRegisterClinicPatientsCommandHandler(patientRepo, uow, _clinicContext);

        var bulkItems = new List<BulkPatientItemDto>
        {
            new("BulkOne", "Patient", null, null, new DateOnly(2000, 1, 1), "Male", null, "09171110003", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null),
            new("BulkTwo", "Patient", null, null, new DateOnly(2001, 2, 2), "Female", null, "09171110004", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null)
        };

        var command = new BulkRegisterClinicPatientsCommand(bulkItems);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.TotalProcessed.Should().Be(2);
        result.SuccessCount.Should().Be(2);
        result.CreatedPatients.Should().HaveCount(2);

        result.CreatedPatients[0].PatientCode.Should().Be($"PAT-{year}-00003");
        result.CreatedPatients[1].PatientCode.Should().Be($"PAT-{year}-00004");
    }

    [Fact]
    public async Task PublicStudentSelfEnroll_WithSoftDeletedPatient_AssignsNextSequenceAndCorrectQueueToken()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var attachmentRepo = TestDbHelper.CreateRepository<ClinicRecordAttachment>(context, sieve);

        // Add soft-deleted patient PAT-YYYY-00001
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00001",
            FirstName = "Archived",
            LastName = "Student",
            DateOfBirth = new DateOnly(2003, 1, 1),
            Gender = "Female",
            ContactNumber = "09180000001",
            IsDeleted = true,
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new PublicStudentSelfEnrollCommandHandler(patientRepo, attachmentRepo, uow, _clinicContext);

        var command = new PublicStudentSelfEnrollCommand(
            FirstName: "Maria",
            LastName: "Santos",
            MiddleName: "Cruz",
            DateOfBirth: new DateOnly(2004, 5, 20),
            Gender: "Female",
            ContactNumber: "09180000002",
            Email: "maria.santos@student.ustp.edu.ph",
            AddressLine: "456 University Ave",
            Barangay: "Barangay 12",
            City: "Cagayan de Oro",
            Province: "Misamis Oriental",
            EmergencyContactName: "Rosa Santos",
            EmergencyContactPhone: "09180000003",
            EmergencyContactRelationship: "Mother",
            BloodType: "O+",
            StudentId: "2024-10023",
            College: "College of Engineering",
            Program: "BS Computer Engineering",
            YearLevel: "1st Year"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Patient.PatientCode.Should().Be($"PAT-{year}-00002");
        result.QueueToken.Should().Be("Q-002");
    }

    [Fact]
    public async Task RegisterPatient_WithSoftDeletedPatientInDifferentClinic_MaintainsClinicIsolation()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var otherClinicId = Guid.NewGuid();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        // Other clinic has PAT-YYYY-00005 (soft-deleted) and PAT-YYYY-00010 (active)
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = otherClinicId,
            PatientCode = $"PAT-{year}-00005",
            FirstName = "Other",
            LastName = "Clinic1",
            DateOfBirth = new DateOnly(1980, 1, 1),
            Gender = "Male",
            ContactNumber = "09190000001",
            IsDeleted = true,
            CreatedAt = DateTime.UtcNow
        });
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = otherClinicId,
            PatientCode = $"PAT-{year}-00010",
            FirstName = "Other",
            LastName = "Clinic2",
            DateOfBirth = new DateOnly(1981, 1, 1),
            Gender = "Female",
            ContactNumber = "09190000002",
            IsDeleted = false,
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Isolated",
            LastName: "Patient",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1999, 1, 1),
            Gender: "Male",
            CivilStatus: null,
            ContactNumber: "09179998888",
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
            Alerts: null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Since our clinic has 0 patients, next code must be PAT-YYYY-00001 regardless of other clinic's codes
        result.Should().NotBeNull();
        result.PatientCode.Should().Be($"PAT-{year}-00001");
    }

    [Fact]
    public async Task RegisterPatient_WithGapsInSequence_AssignsMaxPlusOne()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        // Gaps: 00001 and 00005 exist (00002-00004 missing)
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00001",
            FirstName = "Gap",
            LastName = "One",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Male",
            ContactNumber = "09170001111",
            IsDeleted = false,
            CreatedAt = DateTime.UtcNow
        });
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00005",
            FirstName = "Gap",
            LastName = "Five",
            DateOfBirth = new DateOnly(1992, 2, 2),
            Gender = "Female",
            ContactNumber = "09170005555",
            IsDeleted = true, // soft-deleted gap end
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Next",
            LastName: "Patient",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 5, 5),
            Gender: "Male",
            CivilStatus: null,
            ContactNumber: "09170006666",
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
            Alerts: null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Must be max (5) + 1 = 6 -> PAT-YYYY-00006
        result.Should().NotBeNull();
        result.PatientCode.Should().Be($"PAT-{year}-00006");
    }

    [Fact]
    public async Task RegisterPatient_WithNonStandardCodes_IgnoresNonNumericSuffixesSafely()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        // Codes with non-numeric suffixes or custom tags
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-CHAL",
            FirstName = "Non",
            LastName = "Numeric",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Male",
            ContactNumber = "09170001111",
            IsDeleted = false,
            CreatedAt = DateTime.UtcNow
        });
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00003",
            FirstName = "Numeric",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1992, 2, 2),
            Gender = "Female",
            ContactNumber = "09170003333",
            IsDeleted = false,
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Subsequent",
            LastName: "Patient",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 5, 5),
            Gender: "Female",
            CivilStatus: null,
            ContactNumber: "09170004444",
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
            Alerts: null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: 3 is max numeric, so next is 4 -> PAT-YYYY-00004
        result.Should().NotBeNull();
        result.PatientCode.Should().Be($"PAT-{year}-00004");
    }

    [Fact]
    public async Task RegisterPatient_InFreshClinic_GeneratesSequenceOne()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Fresh",
            LastName: "Patient",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1990, 1, 1),
            Gender: "Male",
            CivilStatus: null,
            ContactNumber: "09170001234",
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
            Alerts: null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientCode.Should().Be($"PAT-{year}-00001");
    }

    [Fact]
    public async Task CheckInPatient_WithControlCharactersAndWhitespace_SanitizesChiefComplaint()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns((ClinicIdentity?)null);
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        var dirtyComplaint = "  Severe headache\0\u0007 with acute fever and chills\u001b  ";
        var command = new CheckInPatientCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "John Doe",
            ChiefComplaint: dirtyComplaint
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Unprintable control characters stripped and leading/trailing whitespace trimmed
        result.Should().NotBeNull();
        result.ChiefComplaint.Should().Be("Severe headache with acute fever and chills");

        var saved = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == result.Id);
        saved.Should().NotBeNull();
        saved!.ChiefComplaint.Should().Be("Severe headache with acute fever and chills");
    }

    [Fact]
    public async Task CheckInPatient_WithLongAppointmentReasonFallback_DefensivelyTruncatesTo255Chars()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns((ClinicIdentity?)null);
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var apptId = Guid.NewGuid();

        // Appointment.Reason allows up to 500 chars (ApplicationDbContext)
        var longReason = new string('R', 400);
        var appointment = new Appointment
        {
            Id = apptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Jane Doe",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reason = longReason,
            CreatedAt = DateTime.UtcNow
        };
        await context.Appointments.AddAsync(appointment);
        await context.SaveChangesAsync();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        // ChiefComplaint is null, so it falls back to appointment.Reason
        var command = new CheckInPatientCommand(
            PatientId: patientId,
            PatientName: "Jane Doe",
            AppointmentId: apptId,
            ChiefComplaint: null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: QueueItem.ChiefComplaint must be defensively truncated to <= 255 chars
        result.Should().NotBeNull();
        result.ChiefComplaint.Should().NotBeNull();
        result.ChiefComplaint!.Length.Should().Be(255);
        result.ChiefComplaint.Should().Be(new string('R', 255));

        var saved = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == result.Id);
        saved.Should().NotBeNull();
        saved!.ChiefComplaint!.Length.Should().Be(255);
    }

    [Fact]
    public async Task ConcurrentRegistrations_SimultaneousTasks_CompleteWithoutUniqueConstraintCollisions()
    {
        // Arrange: 10 parallel simultaneous registrations on the same clinic and year
        var year = DateTime.UtcNow.Year;
        const int concurrentCount = 10;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var generator = new PatientCodeGenerator(context);
        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext, codeGenerator: generator);

        // Act: Run 10 parallel registration commands
        var tasks = Enumerable.Range(1, concurrentCount).Select(i =>
        {
            var command = new RegisterClinicPatientCommand(
                FirstName: $"Parallel{i}",
                LastName: "Concurrent",
                MiddleName: null,
                Suffix: null,
                DateOfBirth: new DateOnly(1990, 1, 1),
                Gender: "Male",
                CivilStatus: null,
                ContactNumber: $"0917000{i:D4}",
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
                Alerts: null
            );
            return handler.Handle(command, CancellationToken.None);
        }).ToList();

        var results = await Task.WhenAll(tasks);

        // Assert:
        results.Should().HaveCount(concurrentCount);
        var codes = results.Select(r => r.PatientCode).ToList();
        codes.Distinct().Should().HaveCount(concurrentCount, "all allocated codes must be strictly unique");

        for (int i = 1; i <= concurrentCount; i++)
        {
            codes.Should().Contain($"PAT-{year}-{i:D5}");
        }

        // Verify sequence tracker is persisted at current sequence = 10
        var tracker = await context.PatientCodeSequenceTrackers
            .FirstOrDefaultAsync(t => t.TenantId == _tenantId && t.ClinicId == _clinicId && t.Year == year);
        tracker.Should().NotBeNull();
        tracker!.CurrentSequence.Should().Be(concurrentCount);
    }

    [Fact]
    public async Task BulkRegistration_AllocatesContinuousRange_InSingleSequenceTrackerUpdate()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var generator = new PatientCodeGenerator(context);
        var handler = new BulkRegisterClinicPatientsCommandHandler(patientRepo, uow, _clinicContext, generator);

        const int bulkCount = 15;
        var items = Enumerable.Range(1, bulkCount).Select(i =>
            new BulkPatientItemDto($"BulkFirst{i}", $"BulkLast{i}", null, null, new DateOnly(2000, 1, 1), "Female", null, $"09170000{i:D2}", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null)
        ).ToList();

        var command = new BulkRegisterClinicPatientsCommand(items);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.TotalProcessed.Should().Be(bulkCount);
        result.SuccessCount.Should().Be(bulkCount);
        result.CreatedPatients.Should().HaveCount(bulkCount);

        for (int i = 0; i < bulkCount; i++)
        {
            result.CreatedPatients[i].PatientCode.Should().Be($"PAT-{year}-{(i + 1):D5}");
        }

        var tracker = await context.PatientCodeSequenceTrackers
            .FirstOrDefaultAsync(t => t.TenantId == _tenantId && t.ClinicId == _clinicId && t.Year == year);
        tracker.Should().NotBeNull();
        tracker!.CurrentSequence.Should().Be(bulkCount);
    }

    [Fact]
    public async Task OptimisticRetry_OnUniqueConstraintCollision_RecoversAndAssignsNextSequence()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var generator = new PatientCodeGenerator(context);

        // Pre-create tracker at sequence 1
        var tracker = new PatientCodeSequenceTracker
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Year = year,
            CurrentSequence = 1,
            LastAssignedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Seed"
        };
        await context.PatientCodeSequenceTrackers.AddAsync(tracker);

        // Out-of-band record existing at PAT-YYYY-00002 (simulating race or external insert)
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00002",
            FirstName = "PreExisting",
            LastName = "Collision",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Male",
            ContactNumber = "09170002222",
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext, codeGenerator: generator);
        var command = new RegisterClinicPatientCommand(
            FirstName: "Recovered",
            LastName: "Patient",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 1, 1),
            Gender: "Female",
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
            Alerts: null
        );

        // Act: Handler encounters collision on 00002, retries, and allocates 00003
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientCode.Should().Be($"PAT-{year}-00003");

        var saved = await context.Patients.FirstOrDefaultAsync(p => p.Id == result.Id);
        saved.Should().NotBeNull();
        saved!.PatientCode.Should().Be($"PAT-{year}-00003");
    }

    [Fact]
    public async Task ExternalIntake_AppointmentBookedHandler_GeneratesStandardizedExternalPrefix()
    {
        // Arrange
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, _tenantId);
        var patientId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        var booked = new AppointmentBookedEvent
        {
            Id = Guid.NewGuid(),
            DraftId = draftId,
            PatientId = patientId,
            ClinicId = clinicId,
            TenantId = _tenantId,
            PreferredDate = new DateOnly(2026, 9, 25),
            PreferredTime = "09:00",
            Reason = "External consultation",
            CreatedAt = DateTime.UtcNow
        };

        var handler = new AppointmentBookedHandler(
            db,
            MessagingTestKit.Recipient(db),
            new InteropPublisher(db),
            NullLogger<AppointmentBookedHandler>.Instance);

        var context = MessagingTestKit.Delivered(
            InteropTypes.PatientAppointmentBooked,
            Party.ForPatient(patientId.ToString()),
            MessagingTestKit.ClinicParty(_tenantId, clinicId),
            draftId,
            booked);

        // Act
        await handler.HandleAsync(booked, context, CancellationToken.None);

        // Assert: External intake patient must have PAT-EXT-{yyyyMMdd}-{GUID_SHORT}
        var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ClinicId == clinicId && p.SyncPatientId == patientId);
        patient.Should().NotBeNull();
        patient!.PatientCode.Should().MatchRegex(@"^PAT-EXT-\d{8}-[A-F0-9]{6}$");
        patient.PatientCode.Should().StartWith($"PAT-EXT-{DateTime.UtcNow:yyyyMMdd}-");
    }

    [Fact]
    public async Task ExternalIntake_PatientShareSnapshotHandler_GeneratesStandardizedExternalPrefix()
    {
        // Arrange
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, _tenantId);
        var patientPlaneId = Guid.NewGuid();

        var import = new ShareImport
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = clinicId,
            AddToQueue = false,
            ChiefComplaint = "Checkup"
        };
        db.ShareImports.Add(import);
        await db.SaveChangesAsync();

        var payload = new PatientShareSnapshotPayload
        {
            GrantId = Guid.NewGuid(),
            PatientId = patientPlaneId,
            Scopes = SharingScopes.Demographics,
            Granted = true,
            ExpiresAtUtc = DateTime.UtcNow.AddHours(1),
            Demographics = new ShareDemographicsDto
            {
                FullName = "Maria Santos",
                Sex = "Female",
                DateOfBirth = "2000-01-01",
                MobileNumber = "09170001234",
                Email = "maria@example.com"
            }
        };

        var handler = new PatientShareSnapshotHandler(
            db,
            MessagingTestKit.Recipient(db),
            NullLogger<PatientShareSnapshotHandler>.Instance);

        var msgContext = MessagingTestKit.Delivered(
            InteropTypes.PatientShareSnapshot,
            Party.ForPatient(patientPlaneId.ToString()),
            MessagingTestKit.ClinicParty(_tenantId, clinicId),
            import.Id,
            payload);

        // Act
        await handler.HandleAsync(payload, msgContext, CancellationToken.None);

        // Assert: External intake patient must have PAT-EXT-{yyyyMMdd}-{GUID_SHORT}
        var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ClinicId == clinicId && p.SyncPatientId == patientPlaneId);
        patient.Should().NotBeNull();
        patient!.PatientCode.Should().MatchRegex(@"^PAT-EXT-\d{8}-[A-F0-9]{6}$");
        patient.PatientCode.Should().StartWith($"PAT-EXT-{DateTime.UtcNow:yyyyMMdd}-");
    }

    [Fact]
    public async Task ExternalIntake_DoesNotDisturbClinicInternalSequenceTracker()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        // Pre-existing external intake patient with PAT-EXT-
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-EXT-{DateTime.UtcNow:yyyyMMdd}-ABC123",
            FirstName = "External",
            LastName = "Intake",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Male",
            ContactNumber = "09170009999",
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);
        var command = new RegisterClinicPatientCommand(
            FirstName: "FrontDesk",
            LastName: "Patient",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 1, 1),
            Gender: "Male",
            CivilStatus: null,
            ContactNumber: "09170008888",
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
            Alerts: null
        );

        // Act: Front-desk patient registers
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Starts at PAT-{YYYY}-00001 despite pre-existing PAT-EXT-
        result.Should().NotBeNull();
        result.PatientCode.Should().Be($"PAT-{year}-00001");
    }

    [Fact]
    public async Task PublicStudentSelfEnroll_OptimisticRetry_OnCollision_RecoversAndAssignsNextSequence()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var attachmentRepo = TestDbHelper.CreateRepository<ClinicRecordAttachment>(context, sieve);
        var generator = new PatientCodeGenerator(context);

        // Pre-create tracker at sequence 1
        var tracker = new PatientCodeSequenceTracker
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Year = year,
            CurrentSequence = 1,
            LastAssignedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Seed"
        };
        await context.PatientCodeSequenceTrackers.AddAsync(tracker);

        // Out-of-band record existing at PAT-YYYY-00002 (simulating race or external insert)
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00002",
            FirstName = "PreExisting",
            LastName = "Collision",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Male",
            ContactNumber = "09170002222",
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new PublicStudentSelfEnrollCommandHandler(patientRepo, attachmentRepo, uow, _clinicContext, codeGenerator: generator);
        var command = new PublicStudentSelfEnrollCommand(
            FirstName: "Maria",
            LastName: "Santos",
            MiddleName: "Cruz",
            DateOfBirth: new DateOnly(2004, 5, 20),
            Gender: "Female",
            ContactNumber: "09180000002",
            Email: "maria.santos@student.edu.ph",
            AddressLine: "University Ave",
            Barangay: "Brgy 1",
            City: "City",
            Province: "Province",
            EmergencyContactName: "Parent",
            EmergencyContactPhone: "09180000003",
            EmergencyContactRelationship: "Mother",
            BloodType: "O+",
            StudentId: "2024-10023",
            College: "College of Engineering",
            Program: "BS Computer Engineering",
            YearLevel: "1st Year"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Collided on 00002, recovered with 00003
        result.Should().NotBeNull();
        result.Patient.PatientCode.Should().Be($"PAT-{year}-00003");
        result.QueueToken.Should().Be("Q-003");
    }

    [Fact]
    public async Task BulkRegisterPatients_OptimisticRetry_OnCollision_RecoversAndAssignsNextSequence()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var generator = new PatientCodeGenerator(context);

        // Pre-create tracker at sequence 1
        var tracker = new PatientCodeSequenceTracker
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Year = year,
            CurrentSequence = 1,
            LastAssignedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Seed"
        };
        await context.PatientCodeSequenceTrackers.AddAsync(tracker);

        // Out-of-band collision on PAT-YYYY-00002
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00002",
            FirstName = "PreExisting",
            LastName = "BulkCollision",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Male",
            ContactNumber = "09170002222",
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new BulkRegisterClinicPatientsCommandHandler(patientRepo, uow, _clinicContext, generator);
        var bulkItems = new List<BulkPatientItemDto>
        {
            new("First", "Bulk", null, null, new DateOnly(2000, 1, 1), "Male", null, "09170001111", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null),
            new("Second", "Bulk", null, null, new DateOnly(2001, 1, 1), "Female", null, "09170001112", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null)
        };

        var command = new BulkRegisterClinicPatientsCommand(bulkItems);

        // Act: Initial reservation of 2 allocates 00002 and 00003, which collides on 00002.
        // Retry allocates next batch of 2 (00004 and 00005) and persists successfully.
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.TotalProcessed.Should().Be(2);
        result.SuccessCount.Should().Be(2);
        result.CreatedPatients[0].PatientCode.Should().Be($"PAT-{year}-00004");
        result.CreatedPatients[1].PatientCode.Should().Be($"PAT-{year}-00005");

        var updatedTracker = await context.PatientCodeSequenceTrackers
            .FirstOrDefaultAsync(t => t.TenantId == _tenantId && t.ClinicId == _clinicId && t.Year == year);
        updatedTracker.Should().NotBeNull();
        updatedTracker!.CurrentSequence.Should().Be(5);
    }

    [Theory]
    [InlineData("23505: duplicate key value violates unique constraint \"IX_ClinicPatients_ClinicId_PatientCode\"", true)]
    [InlineData("23505: duplicate key value violates unique constraint \"IX_ClinicPatients_TenantId_ClinicId_PatientCode\"", true)]
    [InlineData("Key (clinic_id, patient_code)=(...) already exists.", true)]
    [InlineData("duplicate key value violates unique constraint on PatientCode", true)]
    [InlineData("23505: duplicate key value violates unique constraint \"IX_StaffMembers_ClinicId_Email\"", false)]
    [InlineData("23505: duplicate key value violates unique constraint \"IX_ClinicRefreshTokens_TokenHash\"", false)]
    [InlineData("23503: insert or update on table \"Appointments\" violates foreign key constraint", false)]
    public void PatientCodeCollisionDetector_DistinguishesPatientCodeCollisions_FromUnrelatedConstraints(
        string exceptionMessage,
        bool expectedIsCollision)
    {
        var ex = new DbUpdateException(exceptionMessage, new Exception(exceptionMessage));
        var actual = PatientCodeCollisionDetector.IsPatientCodeCollision(ex);
        actual.Should().Be(expectedIsCollision);
    }

    [Fact]
    public async Task OptimisticRetry_WithStructuredAllergiesAndQueueItem_PreservesRelatedEntitiesOnRetry()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var allergyRepo = TestDbHelper.CreateRepository<PatientAllergy>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var generator = new PatientCodeGenerator(context);

        // Pre-create tracker at sequence 1
        var tracker = new PatientCodeSequenceTracker
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Year = year,
            CurrentSequence = 1,
            LastAssignedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Seed"
        };
        await context.PatientCodeSequenceTrackers.AddAsync(tracker);

        // Out-of-band collision at PAT-YYYY-00002
        await context.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00002",
            FirstName = "PreExisting",
            LastName = "Collision",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Male",
            ContactNumber = "09170002222",
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(
            patientRepo,
            uow,
            _clinicContext,
            allergyRepo: allergyRepo,
            queueRepo: queueRepo,
            codeGenerator: generator);

        var command = new RegisterClinicPatientCommand(
            FirstName: "Complex",
            LastName: "Patient",
            MiddleName: "Middle",
            Suffix: "Jr",
            DateOfBirth: new DateOnly(1995, 5, 15),
            Gender: "Male",
            CivilStatus: "Single",
            ContactNumber: "09170009999",
            Email: "complex@test.com",
            AddressLine: "123 Main St",
            Barangay: "Brgy 1",
            City: "City",
            Province: "Province",
            EmergencyContactName: "Emergency Contact",
            EmergencyContactPhone: "09170008888",
            EmergencyContactRelationship: "Brother",
            PhilHealthNumber: "12-345678901-2",
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: "A+",
            Allergies: null,
            ChronicConditions: null,
            Alerts: null,
            StructuredAllergies: new List<CreateAllergyRequest>
            {
                new(Category: "Medication", Allergen: "Amoxicillin", AllergenDrugCode: null, Severity: "Severe", ReactionManifestation: "Hives and swelling", IsAnaphylactic: false, OnsetDate: new DateOnly(2020, 1, 1), Notes: "Penicillin allergy")
            },
            SendToTriage: true,
            Priority: "Urgent",
            ChiefComplaint: "Fever and cough"
        );

        // Act: Encounters collision on 00002, retries, and allocates 00003
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientCode.Should().Be($"PAT-{year}-00003");
        result.ActiveQueueTicket.Should().NotBeNull();
        result.ActiveQueueTicket.Should().Be("Q-001");

        // Verify patient entity
        var savedPatient = await context.Patients.FirstOrDefaultAsync(p => p.Id == result.Id);
        savedPatient.Should().NotBeNull();
        savedPatient!.PatientCode.Should().Be($"PAT-{year}-00003");

        // Verify allergy entity persisted intact across retry
        var savedAllergy = await context.Set<PatientAllergy>().FirstOrDefaultAsync(a => a.PatientId == result.Id);
        savedAllergy.Should().NotBeNull();
        savedAllergy!.Allergen.Should().Be("Amoxicillin");
        savedAllergy.Severity.Should().Be(AllergySeverity.Severe);

        // Verify queue item persisted intact across retry
        var savedQueue = await context.QueueItems.FirstOrDefaultAsync(q => q.PatientId == result.Id);
        savedQueue.Should().NotBeNull();
        savedQueue!.QueueNumber.Should().Be("Q-001");
        savedQueue.Priority.Should().Be(QueuePriority.Urgent);
    }

    [Fact]
    public async Task PatientJoinRequestedHandler_EliminatesTableScans_AndUsesSequenceGenerator()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        using var db = MessagingTestKit.CreateDbContext();
        var clinic = MessagingTestKit.SeedClinic(db, _clinicId, _tenantId, "Join Test Clinic");
        clinic.FacilitySlug = "join-test";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "JOIN123";
        clinic.JoinCodeExpiresAt = DateTime.UtcNow.AddDays(7);
        await db.SaveChangesAsync();

        var generator = new PatientCodeGenerator(db);

        // Pre-create tracker at sequence 1
        var tracker = new PatientCodeSequenceTracker
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Year = year,
            CurrentSequence = 1,
            LastAssignedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Seed"
        };
        await db.PatientCodeSequenceTrackers.AddAsync(tracker);

        // Out-of-band collision on PAT-YYYY-00002
        await db.Patients.AddAsync(new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = $"PAT-{year}-00002",
            FirstName = "PreExisting",
            LastName = "JoinCollision",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Male",
            ContactNumber = "09170002222",
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var recipient = MessagingTestKit.Recipient(db);
        var handler = new PatientJoinRequestedHandler(db, recipient, NullLogger<PatientJoinRequestedHandler>.Instance, generator);

        var payload = new PatientJoinRequestedPayload
        {
            JoinRequestId = Guid.NewGuid(),
            TenantSlug = _tenantId,
            FacilitySlug = "join-test",
            JoinCode = "JOIN123",
            FirstName = "Portal",
            LastName = "Applicant",
            MiddleName = "Test",
            DateOfBirth = new DateOnly(1998, 3, 10),
            Sex = "Female",
            ContactNumber = "09170005555"
        };

        var to = MessagingTestKit.ClinicParty(_tenantId, _clinicId);
        var messageContext = MessagingTestKit.Delivered(InteropTypes.PatientJoinRequested, Party.Portal, to, payload.JoinRequestId.Value, payload);

        // Act: Handler encounters collision on 00002, retries, and allocates 00003
        await handler.HandleAsync(payload, messageContext, CancellationToken.None);

        // Assert
        var patient = await db.Patients.IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => p.FirstName == "Portal" && p.LastName == "Applicant");

        patient.Should().NotBeNull();
        patient!.PatientCode.Should().Be($"PAT-{year}-00003");

        var updatedTracker = await db.PatientCodeSequenceTrackers
            .FirstOrDefaultAsync(t => t.TenantId == _tenantId && t.ClinicId == _clinicId && t.Year == year);
        updatedTracker.Should().NotBeNull();
        updatedTracker!.CurrentSequence.Should().Be(3);
    }

    [Fact]
    public async Task MultiProcessConcurrentInitialization_ResolvesUniqueConstraintAndAllocatesContinuousSequences()
    {
        // Arrange: Simulate 2 independent processes sharing the same database but no shared semaphore
        var sharedDbName = $"SharedDb_Bootstrap_{Guid.NewGuid()}";
        var year = DateTime.UtcNow.Year;
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_multiproc_init";

        var contextMock1 = Substitute.For<IClinicContext>();
        contextMock1.ClinicId.Returns(clinicId);
        contextMock1.TenantId.Returns(tenantId);

        var contextMock2 = Substitute.For<IClinicContext>();
        contextMock2.ClinicId.Returns(clinicId);
        contextMock2.TenantId.Returns(tenantId);

        var (db1, _, _) = TestDbHelper.CreateSharedTestContext(sharedDbName, contextMock1);
        var (db2, _, _) = TestDbHelper.CreateSharedTestContext(sharedDbName, contextMock2);

        var generator1 = new PatientCodeGenerator(db1) { BypassSemaphore = true };
        var generator2 = new PatientCodeGenerator(db2) { BypassSemaphore = true };

        // Act: Concurrently initialize and reserve ranges from a blank database
        var task1 = Task.Run(() => generator1.ReserveBatchCodesAsync(tenantId, clinicId, 5, year));
        var task2 = Task.Run(() => generator2.ReserveBatchCodesAsync(tenantId, clinicId, 5, year));

        var results = await Task.WhenAll(task1, task2);
        var batch1 = results[0];
        var batch2 = results[1];

        // Assert: 10 distinct codes allocated, no duplicate codes, continuous range 1..10
        var allCodes = batch1.Concat(batch2).ToList();
        allCodes.Should().HaveCount(10);
        allCodes.Distinct().Should().HaveCount(10);

        var expectedCodes = Enumerable.Range(1, 10).Select(seq => $"PAT-{year}-{seq:D5}").ToHashSet();
        allCodes.ToHashSet().Should().BeEquivalentTo(expectedCodes);

        // Tracker in DB should be at sequence 10
        var tracker = await db1.PatientCodeSequenceTrackers.AsNoTracking().FirstOrDefaultAsync(t => t.TenantId == tenantId && t.ClinicId == clinicId && t.Year == year);
        tracker.Should().NotBeNull();
        tracker!.CurrentSequence.Should().Be(10);
    }

    [Fact]
    public async Task MultiProcessConcurrentTrackerUpdates_DetectsConcurrencyConflictAndRetriesOptimistically()
    {
        // Arrange: Seed an existing tracker at sequence 50
        var sharedDbName = $"SharedDb_Update_{Guid.NewGuid()}";
        var year = DateTime.UtcNow.Year;
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_multiproc_update";

        var contextMock1 = Substitute.For<IClinicContext>();
        contextMock1.ClinicId.Returns(clinicId);
        contextMock1.TenantId.Returns(tenantId);

        var (dbSeed, _, _) = TestDbHelper.CreateSharedTestContext(sharedDbName, contextMock1);
        dbSeed.PatientCodeSequenceTrackers.Add(new PatientCodeSequenceTracker
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Year = year,
            CurrentSequence = 50,
            LastAssignedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Seed"
        });
        await dbSeed.SaveChangesAsync();

        var (db1, _, _) = TestDbHelper.CreateSharedTestContext(sharedDbName, contextMock1);
        var (db2, _, _) = TestDbHelper.CreateSharedTestContext(sharedDbName, contextMock1);

        var generator1 = new PatientCodeGenerator(db1) { BypassSemaphore = true };
        var generator2 = new PatientCodeGenerator(db2) { BypassSemaphore = true };

        // Act: Concurrently update tracker from 2 independent processes
        var task1 = Task.Run(() => generator1.ReserveBatchCodesAsync(tenantId, clinicId, 3, year));
        var task2 = Task.Run(() => generator2.ReserveBatchCodesAsync(tenantId, clinicId, 3, year));

        var results = await Task.WhenAll(task1, task2);
        var batch1 = results[0];
        var batch2 = results[1];

        // Assert: 6 distinct codes allocated (51..56) without collisions
        var allCodes = batch1.Concat(batch2).ToList();
        allCodes.Should().HaveCount(6);
        allCodes.Distinct().Should().HaveCount(6);

        var expectedCodes = Enumerable.Range(51, 6).Select(seq => $"PAT-{year}-{seq:D5}").ToHashSet();
        allCodes.ToHashSet().Should().BeEquivalentTo(expectedCodes);

        var tracker = await dbSeed.PatientCodeSequenceTrackers.AsNoTracking().FirstOrDefaultAsync(t => t.TenantId == tenantId && t.ClinicId == clinicId && t.Year == year);
        tracker.Should().NotBeNull();
        tracker!.CurrentSequence.Should().Be(56);
    }

    [Fact]
    public async Task MultiProcessConcurrentPatientRegistrations_ProduceZeroCollisions()
    {
        // Arrange: 10 parallel registration tasks using separate DbContexts and unshared semaphores
        var sharedDbName = $"SharedDb_Registrations_{Guid.NewGuid()}";
        var year = DateTime.UtcNow.Year;
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_multiproc_reg";

        const int workerCount = 10;
        var tasks = new List<Task<ClinicPatientDto>>();

        for (int i = 0; i < workerCount; i++)
        {
            var workerIndex = i;
            tasks.Add(Task.Run(async () =>
            {
                var contextMock = Substitute.For<IClinicContext>();
                contextMock.ClinicId.Returns(clinicId);
                contextMock.TenantId.Returns(tenantId);

                var (db, uow, sieve) = TestDbHelper.CreateSharedTestContext(sharedDbName, contextMock);
                var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
                var generator = new PatientCodeGenerator(db) { BypassSemaphore = true };

                var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, contextMock, codeGenerator: generator);

                var command = new RegisterClinicPatientCommand(
                    FirstName: $"Worker{workerIndex}",
                    LastName: "Test",
                    MiddleName: null,
                    Suffix: null,
                    DateOfBirth: new DateOnly(1990, 1, 1),
                    Gender: "Male",
                    CivilStatus: null,
                    ContactNumber: $"0917000{workerIndex:D4}",
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
                    Alerts: null
                );

                return await handler.Handle(command, CancellationToken.None);
            }));
        }

        // Act
        var registeredPatients = await Task.WhenAll(tasks);

        // Assert: All 10 succeeded, all 10 have unique codes, continuous 1..10
        registeredPatients.Should().HaveCount(workerCount);
        var allocatedCodes = registeredPatients.Select(p => p.PatientCode).ToList();
        allocatedCodes.Distinct().Should().HaveCount(workerCount);

        var expectedCodes = Enumerable.Range(1, workerCount).Select(seq => $"PAT-{year}-{seq:D5}").ToHashSet();
        allocatedCodes.ToHashSet().Should().BeEquivalentTo(expectedCodes);
    }
}
