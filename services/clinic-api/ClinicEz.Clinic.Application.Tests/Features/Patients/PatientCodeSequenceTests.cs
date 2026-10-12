using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
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
}
