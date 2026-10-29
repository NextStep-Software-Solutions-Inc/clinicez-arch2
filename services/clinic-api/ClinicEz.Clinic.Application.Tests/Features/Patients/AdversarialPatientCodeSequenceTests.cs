using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.DTOs;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using FluentValidation.TestHelper;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class AdversarialPatientCodeSequenceTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_adv_test";
    private readonly IClinicContext _clinicContext;

    public AdversarialPatientCodeSequenceTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task SoftDeletedPatient_MultiBatchAndInterleaved_PreventsCollisions()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var prefix = $"PAT-{year}-";
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var attachmentRepo = TestDbHelper.CreateRepository<RecordAttachment>(context, sieve);

        // Seed 1..5, where 3 and 5 are soft-deleted
        for (int i = 1; i <= 5; i++)
        {
            var isDel = (i == 3 || i == 5);
            await context.Patients.AddAsync(new Patient
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = _clinicId,
                PatientCode = $"{prefix}{i:D5}",
                FirstName = $"Seed{i}",
                LastName = "Test",
                DateOfBirth = new DateOnly(1990, 1, 1),
                Gender = Gender.Male,
                ContactNumber = $"091700000{i:D2}",
                IsDeleted = isDel,
                CreatedAt = DateTime.UtcNow
            });
        }
        await context.SaveChangesAsync();

        var singleHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);
        var bulkHandler = new BulkRegisterClinicPatientsCommandHandler(patientRepo, uow, _clinicContext);
        var selfEnrollHandler = new PublicStudentSelfEnrollCommandHandler(patientRepo, attachmentRepo, uow, _clinicContext);

        // 1. Single register Charlie -> should get 00006
        var singleCmd1 = CreateRegisterCommand("Charlie", "One");
        var res1 = await singleHandler.Handle(singleCmd1, CancellationToken.None);
        res1.PatientCode.Should().Be($"{prefix}00006");

        // Soft-delete 00006
        var p6 = await context.Patients.IgnoreQueryFilters().FirstAsync(p => p.Id == res1.Id);
        p6.IsDeleted = true;
        await context.SaveChangesAsync();

        // 2. Bulk register 3 patients -> should get 00007, 00008, 00009
        var bulkCmd = new BulkRegisterClinicPatientsCommand(new List<BulkPatientItemDto>
        {
            new("BulkA", "Seven", null, null, new DateOnly(2000, 1, 1), "Male", null, "09171000007", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null),
            new("BulkB", "Eight", null, null, new DateOnly(2000, 1, 2), "Female", null, "09171000008", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null),
            new("BulkC", "Nine", null, null, new DateOnly(2000, 1, 3), "Male", null, "09171000009", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null)
        });
        var bulkRes = await bulkHandler.Handle(bulkCmd, CancellationToken.None);
        bulkRes.CreatedPatients.Should().HaveCount(3);
        bulkRes.CreatedPatients[0].PatientCode.Should().Be($"{prefix}00007");
        bulkRes.CreatedPatients[1].PatientCode.Should().Be($"{prefix}00008");
        bulkRes.CreatedPatients[2].PatientCode.Should().Be($"{prefix}00009");

        // Soft-delete 00009
        var p9 = await context.Patients.IgnoreQueryFilters().FirstAsync(p => p.Id == bulkRes.CreatedPatients[2].Id);
        p9.IsDeleted = true;
        await context.SaveChangesAsync();

        // 3. Student self-enroll -> should get 00010, token Q-010
        var selfEnrollCmd = CreateSelfEnrollCommand("Student", "Ten");
        var selfRes = await selfEnrollHandler.Handle(selfEnrollCmd, CancellationToken.None);
        selfRes.Patient.PatientCode.Should().Be($"{prefix}00010");
        selfRes.QueueToken.Should().Be("Q-010");

        // Verify total patients in database (including soft-deleted) has 10 distinct codes
        var allCodes = await context.Patients.IgnoreQueryFilters()
            .Where(p => p.ClinicId == _clinicId)
            .Select(p => p.PatientCode)
            .ToListAsync();

        allCodes.Should().HaveCount(10);
        allCodes.Distinct().Should().HaveCount(10);
        for (int i = 1; i <= 10; i++)
        {
            allCodes.Should().Contain($"{prefix}{i:D5}");
        }
    }

    [Fact]
    public async Task CrossClinicIsolation_WithIdenticalYearAndMixedSoftDeletes_DoesNotInterfere()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var prefix = $"PAT-{year}-";

        var clinic1Id = Guid.NewGuid();
        var clinic2Id = Guid.NewGuid();
        var clinic3Id = Guid.NewGuid();

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        // Clinic 1: 1..20 (11..20 soft-deleted)
        for (int i = 1; i <= 20; i++)
        {
            await context.Patients.AddAsync(new Patient
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = clinic1Id,
                PatientCode = $"{prefix}{i:D5}",
                FirstName = $"C1_{i}",
                LastName = "Test",
                DateOfBirth = new DateOnly(1990, 1, 1),
                Gender = Gender.Male,
                ContactNumber = "09170000001",
                IsDeleted = i > 10,
                CreatedAt = DateTime.UtcNow
            });
        }

        // Clinic 2: 1..5 (4..5 soft-deleted)
        for (int i = 1; i <= 5; i++)
        {
            await context.Patients.AddAsync(new Patient
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = clinic2Id,
                PatientCode = $"{prefix}{i:D5}",
                FirstName = $"C2_{i}",
                LastName = "Test",
                DateOfBirth = new DateOnly(1990, 1, 1),
                Gender = Gender.Female,
                ContactNumber = "09170000002",
                IsDeleted = i > 3,
                CreatedAt = DateTime.UtcNow
            });
        }
        await context.SaveChangesAsync();

        // Clinic 1 handler
        var clinic1Context = Substitute.For<IClinicContext>();
        clinic1Context.ClinicId.Returns(clinic1Id);
        clinic1Context.TenantId.Returns(_tenantId);
        var handler1 = new RegisterClinicPatientCommandHandler(patientRepo, uow, clinic1Context);

        // Clinic 2 handler
        var clinic2Context = Substitute.For<IClinicContext>();
        clinic2Context.ClinicId.Returns(clinic2Id);
        clinic2Context.TenantId.Returns(_tenantId);
        var handler2 = new RegisterClinicPatientCommandHandler(patientRepo, uow, clinic2Context);

        // Clinic 3 handler (empty clinic)
        var clinic3Context = Substitute.For<IClinicContext>();
        clinic3Context.ClinicId.Returns(clinic3Id);
        clinic3Context.TenantId.Returns(_tenantId);
        var handler3 = new RegisterClinicPatientCommandHandler(patientRepo, uow, clinic3Context);

        // Act
        var res1 = await handler1.Handle(CreateRegisterCommand("Pat", "One"), CancellationToken.None);
        var res2 = await handler2.Handle(CreateRegisterCommand("Pat", "Two"), CancellationToken.None);
        var res3 = await handler3.Handle(CreateRegisterCommand("Pat", "Three"), CancellationToken.None);

        // Assert:
        // Clinic 1 max was 20 -> next must be 21
        res1.PatientCode.Should().Be($"{prefix}00021");

        // Clinic 2 max was 5 -> next must be 6
        res2.PatientCode.Should().Be($"{prefix}00006");

        // Clinic 3 had 0 -> next must be 1
        res3.PatientCode.Should().Be($"{prefix}00001");
    }

    [Fact]
    public async Task BulkRegister_HighVolumeContiguity_WithScatteredSoftDeletes()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var prefix = $"PAT-{year}-";
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        // Seed scattered sequences: 1 (active), 2 (soft-deleted), 15 (soft-deleted), 42 (active), 99 (soft-deleted)
        var existingIndices = new[] { (1, false), (2, true), (15, true), (42, false), (99, true) };
        foreach (var (idx, isDeleted) in existingIndices)
        {
            await context.Patients.AddAsync(new Patient
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = _clinicId,
                PatientCode = $"{prefix}{idx:D5}",
                FirstName = $"Scatter_{idx}",
                LastName = "Patient",
                DateOfBirth = new DateOnly(1995, 1, 1),
                Gender = Gender.Male,
                ContactNumber = "09170000099",
                IsDeleted = isDeleted,
                CreatedAt = DateTime.UtcNow
            });
        }
        await context.SaveChangesAsync();

        var handler = new BulkRegisterClinicPatientsCommandHandler(patientRepo, uow, _clinicContext);

        // Bulk register 25 patients
        var bulkItems = Enumerable.Range(1, 25).Select(i =>
            new BulkPatientItemDto($"BulkFirst{i}", $"BulkLast{i}", null, null, new DateOnly(2000, 1, 1), "Female", null, $"091700000{i:D2}", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null)
        ).ToList();

        var command = new BulkRegisterClinicPatientsCommand(bulkItems);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert:
        // Max existing was 99, so bulk patients must start at 100 through 124
        result.TotalProcessed.Should().Be(25);
        result.SuccessCount.Should().Be(25);
        result.CreatedPatients.Should().HaveCount(25);

        for (int i = 0; i < 25; i++)
        {
            var expectedSeq = 100 + i;
            result.CreatedPatients[i].PatientCode.Should().Be($"{prefix}{expectedSeq:D5}");
        }
    }

    [Theory]
    [InlineData(0, 1, "Q-001")]
    [InlineData(499, 500, "Q-500")]
    [InlineData(500, 501, "Q-001")]      // First rollover at 501
    [InlineData(999, 1000, "Q-500")]
    [InlineData(1000, 1001, "Q-001")]    // Second rollover at 1001
    [InlineData(1499, 1500, "Q-500")]
    [InlineData(1500, 1501, "Q-001")]    // Third rollover at 1501
    public async Task StudentSelfEnroll_TokenRolloverAndSoftDeletedPatients(int existingMax, int expectedNext, string expectedToken)
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var prefix = $"PAT-{year}-";
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var attachmentRepo = TestDbHelper.CreateRepository<RecordAttachment>(context, sieve);

        if (existingMax > 0)
        {
            // Seed a soft-deleted patient at existingMax
            await context.Patients.AddAsync(new Patient
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = _clinicId,
                PatientCode = $"{prefix}{existingMax:D5}",
                FirstName = "Boundary",
                LastName = "Student",
                DateOfBirth = new DateOnly(2002, 1, 1),
                Gender = Gender.Male,
                ContactNumber = "09180000000",
                IsDeleted = true,
                CreatedAt = DateTime.UtcNow
            });
            await context.SaveChangesAsync();
        }

        var handler = new PublicStudentSelfEnrollCommandHandler(patientRepo, attachmentRepo, uow, _clinicContext);
        var command = CreateSelfEnrollCommand("Enrolled", $"Student_{existingMax}");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Patient.PatientCode.Should().Be($"{prefix}{expectedNext:D5}");
        result.QueueToken.Should().Be(expectedToken);
    }

    [Fact]
    public async Task AdversarialNonStandardCodes_ExtremeInputsAndBypassAttempts()
    {
        // Arrange
        var year = DateTime.UtcNow.Year;
        var prefix = $"PAT-{year}-";
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        // Seed dirty, malformed, overflow, and custom suffix codes
        var weirdCodes = new[]
        {
            $"{prefix}",                               // Empty suffix
            $"{prefix}ABCDEF",                         // Non-numeric
            $"{prefix}9999999999999999999999999999",   // Huge string overflow (exceeds int64)
            $"{prefix}-00005",                         // Negative
            $"{prefix}00007",                          // Legitimate numeric (7)
            $"{prefix}12A34",                          // Alphanumeric mixed
            $"{prefix}NaN",                            // NaN string
            $"{prefix}null"                            // null literal string
        };

        foreach (var code in weirdCodes)
        {
            await context.Patients.AddAsync(new Patient
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = _clinicId,
                PatientCode = code,
                FirstName = "Weird",
                LastName = "Code",
                DateOfBirth = new DateOnly(1990, 1, 1),
                Gender = Gender.Male,
                ContactNumber = "09170000000",
                IsDeleted = true, // even if soft-deleted
                CreatedAt = DateTime.UtcNow
            });
        }
        await context.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(CreateRegisterCommand("Standard", "Patient"), CancellationToken.None);

        // Assert: 7 was the only valid positive integer suffix, so next must be 8
        result.PatientCode.Should().Be($"{prefix}00008");
    }

    [Fact]
    public async Task DifferentYearCodes_AreIgnoredByCurrentYearSequence()
    {
        // Arrange
        var currentYear = DateTime.UtcNow.Year;
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        // Seed codes from other years (both active and soft-deleted)
        var otherYearCodes = new[]
        {
            $"PAT-{currentYear - 2}-99999",
            $"PAT-{currentYear - 1}-00500",
            $"PAT-{currentYear + 1}-00010"
        };

        foreach (var code in otherYearCodes)
        {
            await context.Patients.AddAsync(new Patient
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = _clinicId,
                PatientCode = code,
                FirstName = "OldYear",
                LastName = "Patient",
                DateOfBirth = new DateOnly(1990, 1, 1),
                Gender = Gender.Male,
                ContactNumber = "09170000000",
                IsDeleted = true,
                CreatedAt = DateTime.UtcNow
            });
        }
        await context.SaveChangesAsync();

        var handler = new RegisterClinicPatientCommandHandler(patientRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(CreateRegisterCommand("Current", "YearPatient"), CancellationToken.None);

        // Assert: Current year sequence starts at 1
        result.PatientCode.Should().Be($"PAT-{currentYear}-00001");
    }

    [Fact]
    public async Task CheckInPatient_ChiefComplaint_BoundaryAndSanitizationStress()
    {
        // Arrange
        var validator = new CheckInPatientCommandValidator();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns((ClinicIdentity?)null);
        var publisher = Substitute.For<IPatientAppointmentPublisher>();
        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        // 1. Validator boundary tests:
        var valid255 = new CheckInPatientCommand(Guid.NewGuid(), "Valid", ChiefComplaint: new string('A', 255));
        var validResult = validator.TestValidate(valid255);
        validResult.ShouldNotHaveValidationErrorFor(x => x.ChiefComplaint);

        var invalid256 = new CheckInPatientCommand(Guid.NewGuid(), "Invalid", ChiefComplaint: new string('B', 256));
        var invalidResult = validator.TestValidate(invalid256);
        invalidResult.ShouldHaveValidationErrorFor(x => x.ChiefComplaint)
            .WithErrorMessage("Chief complaint must not exceed 255 characters.");

        // 2. Control character sanitization test:
        // Preserves \r, \n, \t; strips \0, \a, \b, \v, \f, \e
        var dirtyText = "\tLine 1: High fever\0\a\r\nLine 2: Persistent cough\u001b\b\t";
        var dirtyCommand = new CheckInPatientCommand(Guid.NewGuid(), "Dirty", ChiefComplaint: dirtyText);
        var cleanResult = await handler.Handle(dirtyCommand, CancellationToken.None);
        cleanResult.ChiefComplaint.Should().Be("Line 1: High fever\r\nLine 2: Persistent cough");

        // 3. Fallback appointment reason truncation test:
        var apptId = Guid.NewGuid();
        var longReason = new string('Z', 500);
        await context.Appointments.AddAsync(new Appointment
        {
            Id = apptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Fallback Test",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 15,
            Status = AppointmentStatus.Confirmed,
            Reason = longReason,
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var fallbackCommand = new CheckInPatientCommand(Guid.NewGuid(), "Fallback", AppointmentId: apptId, ChiefComplaint: null);
        var fallbackResult = await handler.Handle(fallbackCommand, CancellationToken.None);
        fallbackResult.ChiefComplaint.Should().NotBeNull();
        fallbackResult.ChiefComplaint!.Length.Should().Be(255);
        fallbackResult.ChiefComplaint.Should().Be(new string('Z', 255));
    }

    private static RegisterClinicPatientCommand CreateRegisterCommand(string first, string last)
    {
        return new RegisterClinicPatientCommand(
            FirstName: first,
            LastName: last,
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1995, 6, 15),
            Gender: "Male",
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
            Alerts: null
        );
    }

    private static PublicStudentSelfEnrollCommand CreateSelfEnrollCommand(string first, string last)
    {
        return new PublicStudentSelfEnrollCommand(
            FirstName: first,
            LastName: last,
            MiddleName: null,
            DateOfBirth: new DateOnly(2004, 1, 1),
            Gender: "Male",
            ContactNumber: "09180009999",
            Email: $"{first.ToLower()}@student.edu",
            AddressLine: "Campus",
            Barangay: "Brgy 1",
            City: "City",
            Province: "Province",
            EmergencyContactName: "Parent",
            EmergencyContactPhone: "09180008888",
            EmergencyContactRelationship: "Guardian",
            BloodType: "A+",
            StudentId: "2024-9999",
            College: "Engineering",
            Program: "BSCS",
            YearLevel: "2nd Year"
        );
    }
}
