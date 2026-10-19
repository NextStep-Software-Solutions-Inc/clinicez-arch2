using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

/// <summary>
/// Empirical adversarial verification harness for Milestone 2:
/// ChiefComplaint Validation & Sanitization in services/clinic-api.
/// </summary>
public class ChiefComplaintEmpiricalChallengerTests
{
    private readonly CheckInPatientCommandValidator _validator = new();
    private readonly string _tenantId = "tenant_m2_challenger";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;

    public ChiefComplaintEmpiricalChallengerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
    }

    private static CheckInPatientCommand CreateCommand(
        string? chiefComplaint = null,
        Guid? patientId = null,
        string? patientName = null,
        Guid? appointmentId = null,
        QueuePriority priority = QueuePriority.Routine) =>
        new(
            PatientId: patientId ?? Guid.NewGuid(),
            PatientName: patientName ?? "Test Patient",
            AppointmentId: appointmentId,
            DoctorId: null,
            DoctorName: null,
            Priority: priority,
            ChiefComplaint: chiefComplaint,
            RoomOrStation: "Triage 1"
        );

    #region 1. Boundary & Validator Tests

    [Fact]
    public void Validator_Boundary254Chars_PassesValidation()
    {
        var input = new string('A', 254);
        var command = CreateCommand(chiefComplaint: input);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_Boundary255Chars_PassesValidation()
    {
        var input = new string('A', 255);
        var command = CreateCommand(chiefComplaint: input);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_Boundary256Chars_FailsValidationWithExactMessage()
    {
        var input = new string('A', 256);
        var command = CreateCommand(chiefComplaint: input);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle(e =>
            e.PropertyName == nameof(CheckInPatientCommand.ChiefComplaint) &&
            e.ErrorMessage == "Chief complaint must not exceed 255 characters.");
    }

    [Fact]
    public void Validator_Boundary257Chars_FailsValidation()
    {
        var input = new string('A', 257);
        var command = CreateCommand(chiefComplaint: input);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CheckInPatientCommand.ChiefComplaint));
    }

    [Fact]
    public void Validator_Adversarial10000Chars_FailsValidation()
    {
        var input = new string('X', 10000);
        var command = CreateCommand(chiefComplaint: input);
        var result = _validator.Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle(e =>
            e.PropertyName == nameof(CheckInPatientCommand.ChiefComplaint) &&
            e.ErrorMessage == "Chief complaint must not exceed 255 characters.");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n\r")]
    public void Validator_NullEmptyWhitespace_PassesValidation(string? complaint)
    {
        var command = CreateCommand(chiefComplaint: complaint);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_Unicode255Chars_PassesValidation()
    {
        // 255 Japanese Kanji characters
        var input = string.Concat(Enumerable.Repeat("熱", 255));
        input.Length.Should().Be(255);

        var command = CreateCommand(chiefComplaint: input);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_Unicode256Chars_FailsValidation()
    {
        // 256 Japanese Kanji characters
        var input = string.Concat(Enumerable.Repeat("熱", 256));
        input.Length.Should().Be(256);

        var command = CreateCommand(chiefComplaint: input);
        var result = _validator.Validate(command);
        result.IsValid.Should().BeFalse();
    }

    #endregion

    #region 2. Sanitization & Control Characters Tests

    [Fact]
    public async Task Handler_SanitizesAllAsciiControlCharactersExceptCrLfTab()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns((ClinicIdentity?)null);
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        // Build string with diverse control chars: \0, \a, \b, \v, \f, \u001b, \u007f, plus \t, \r, \n
        var dirtyComplaint = "\0\u0001High fever\u0007 and cough\twith chills\r\nand headache\u001b\u007f";
        var command = CreateCommand(chiefComplaint: dirtyComplaint);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.ChiefComplaint.Should().Be("High fever and cough\twith chills\r\nand headache");

        var persisted = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == result.Id);
        persisted.Should().NotBeNull();
        persisted!.ChiefComplaint.Should().Be("High fever and cough\twith chills\r\nand headache");
    }

    [Fact]
    public async Task Handler_PureControlCharactersAndWhitespace_SanitizesToNull()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns((ClinicIdentity?)null);
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        var dirtyComplaint = "  \0\u0001\u0002\u0003\u001b\u007f \r\n\t  ";
        var command = CreateCommand(chiefComplaint: dirtyComplaint);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.ChiefComplaint.Should().BeNull();

        var persisted = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == result.Id);
        persisted.Should().NotBeNull();
        persisted!.ChiefComplaint.Should().BeNull();
    }

    [Fact]
    public async Task Handler_TrimsLeadingAndTrailingWhitespace()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns((ClinicIdentity?)null);
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        var paddedComplaint = "   \t\r\n   Abdominal cramps for 3 days   \r\n\t   ";
        var command = CreateCommand(chiefComplaint: paddedComplaint);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.ChiefComplaint.Should().Be("Abdominal cramps for 3 days");
    }

    #endregion

    #region 3. Fallback Truncation & Precedence Tests

    [Theory]
    [InlineData(256)]
    [InlineData(300)]
    [InlineData(500)]
    [InlineData(1000)]
    public async Task Handler_AppointmentReasonFallback_Exceeding255Chars_TruncatesToExactly255Chars(int length)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns((ClinicIdentity?)null);
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var apptId = Guid.NewGuid();

        var longReason = new string('F', length);
        var appt = new Appointment
        {
            Id = apptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Test Patient",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reason = longReason,
            CreatedAt = DateTime.UtcNow
        };
        await context.Appointments.AddAsync(appt);
        await context.SaveChangesAsync();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        // CheckIn with null ChiefComplaint -> should fall back to appt.Reason and truncate
        var command = CreateCommand(chiefComplaint: null, appointmentId: apptId, patientId: patientId);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.ChiefComplaint.Should().NotBeNull();
        result.ChiefComplaint!.Length.Should().Be(255);
        result.ChiefComplaint.Should().Be(new string('F', 255));

        var persisted = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == result.Id);
        persisted.Should().NotBeNull();
        persisted!.ChiefComplaint.Should().NotBeNull();
        persisted.ChiefComplaint!.Length.Should().Be(255);
    }

    [Fact]
    public async Task Handler_AppointmentReasonFallback_Exact255Chars_PreservesFullString()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns((ClinicIdentity?)null);
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var apptId = Guid.NewGuid();

        var exact255 = new string('Z', 255);
        var appt = new Appointment
        {
            Id = apptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Test Patient",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reason = exact255,
            CreatedAt = DateTime.UtcNow
        };
        await context.Appointments.AddAsync(appt);
        await context.SaveChangesAsync();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        var command = CreateCommand(chiefComplaint: null, appointmentId: apptId, patientId: patientId);
        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.ChiefComplaint.Should().Be(exact255);
        result.ChiefComplaint!.Length.Should().Be(255);
    }

    [Fact]
    public async Task Handler_DirectChiefComplaint_TakesPrecedenceOverAppointmentReason()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns((ClinicIdentity?)null);
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var apptId = Guid.NewGuid();

        var appt = new Appointment
        {
            Id = apptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Test Patient",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reason = "Original Appointment Reason",
            CreatedAt = DateTime.UtcNow
        };
        await context.Appointments.AddAsync(appt);
        await context.SaveChangesAsync();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        var command = CreateCommand(
            chiefComplaint: "Updated Walk-In Complaint",
            appointmentId: apptId,
            patientId: patientId);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.ChiefComplaint.Should().Be("Updated Walk-In Complaint");
    }

    [Fact]
    public async Task Handler_WhitespaceChiefComplaint_FallsBackToAppointmentReason()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns((ClinicIdentity?)null);
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var apptId = Guid.NewGuid();

        var appt = new Appointment
        {
            Id = apptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Test Patient",
            ScheduledAt = DateTime.UtcNow,
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reason = "Follow-up consultation for hypertension",
            CreatedAt = DateTime.UtcNow
        };
        await context.Appointments.AddAsync(appt);
        await context.SaveChangesAsync();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        // Command has whitespace-only complaint -> should fall back to appt reason
        var command = CreateCommand(
            chiefComplaint: "     ",
            appointmentId: apptId,
            patientId: patientId);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.ChiefComplaint.Should().Be("Follow-up consultation for hypertension");
    }

    [Fact]
    public async Task Handler_BothChiefComplaintAndAppointmentReasonNull_ResultsInNull()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns((ClinicIdentity?)null);
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        var command = CreateCommand(chiefComplaint: null, appointmentId: null);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.ChiefComplaint.Should().BeNull();

        var persisted = await context.QueueItems.FirstOrDefaultAsync(q => q.Id == result.Id);
        persisted.Should().NotBeNull();
        persisted!.ChiefComplaint.Should().BeNull();
    }

    #endregion
}
