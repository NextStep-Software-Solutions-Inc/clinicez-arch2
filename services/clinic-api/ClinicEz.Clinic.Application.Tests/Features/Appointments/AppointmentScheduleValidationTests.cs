using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Behaviors;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Middlewares;
using FluentAssertions;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Clinic.Application.Tests.Features.Appointments;

public sealed class AppointmentScheduleValidationTests
{
    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        private readonly DateTimeOffset _utcNow = new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
        public override DateTimeOffset GetUtcNow() => _utcNow;
    }

    private sealed class CapturingUnitOfWork(IUnitOfWork inner) : IUnitOfWork
    {
        public int SaveChangesCalls { get; private set; }
        public IProductRepository ProductRepository => inner.ProductRepository;
        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveChangesCalls++;
            return inner.SaveChangesAsync(cancellationToken);
        }
        public Task ExecuteInTransactionAsync(Func<CancellationToken, Task> action, CancellationToken cancellationToken = default) =>
            inner.ExecuteInTransactionAsync(action, cancellationToken);
        public Task<T> ExecuteInTransactionAsync<T>(Func<CancellationToken, Task<T>> action, CancellationToken cancellationToken = default) =>
            inner.ExecuteInTransactionAsync(action, cancellationToken);
    }

    [Fact]
    public void IsInPast_RespectsFiveMinuteGraceWindowAndBoundaries()
    {
        var utcNow = new DateTime(2026, 11, 19, 6, 0, 0, DateTimeKind.Utc);
        var clock = new FixedTimeProvider(utcNow);

        AppointmentScheduleValidation.IsInPast(utcNow.AddMinutes(-5).AddSeconds(-1), clock).Should().BeTrue();
        AppointmentScheduleValidation.IsInPast(utcNow.AddHours(-1), clock).Should().BeTrue();
        AppointmentScheduleValidation.IsInPast(default, clock).Should().BeTrue();

        // Within grace window and exact 5-minute boundary
        AppointmentScheduleValidation.IsInPast(utcNow.AddMinutes(-5), clock).Should().BeFalse();
        AppointmentScheduleValidation.IsInPast(utcNow.AddMinutes(-4).AddSeconds(-59), clock).Should().BeFalse();
        AppointmentScheduleValidation.IsInPast(utcNow, clock).Should().BeFalse();

        // Future same-day and future date
        AppointmentScheduleValidation.IsInPast(utcNow.AddMinutes(1), clock).Should().BeFalse();
        AppointmentScheduleValidation.IsInPast(utcNow.AddHours(2), clock).Should().BeFalse();
        AppointmentScheduleValidation.IsInPast(utcNow.AddDays(1), clock).Should().BeFalse();
    }

    [Fact]
    public void NormalizeToUtc_And_IsInPast_TreatUnspecifiedAsAsiaManilaAcrossMidnight()
    {
        // 2026-11-19T06:00:00Z == 2026-11-19 14:00:00 Asia/Manila
        var utcNow = new DateTime(2026, 11, 19, 6, 0, 0, DateTimeKind.Utc);
        var clock = new FixedTimeProvider(utcNow);

        var pastManilaUnspecified = new DateTime(2026, 11, 19, 13, 50, 0, DateTimeKind.Unspecified); // 05:50Z
        var graceManilaUnspecified = new DateTime(2026, 11, 19, 13, 56, 0, DateTimeKind.Unspecified); // 05:56Z
        var futureManilaUnspecified = new DateTime(2026, 11, 19, 14, 5, 0, DateTimeKind.Unspecified); // 06:05Z

        AppointmentScheduleValidation.NormalizeToUtc(pastManilaUnspecified).Should().Be(new DateTime(2026, 11, 19, 5, 50, 0, DateTimeKind.Utc));
        AppointmentScheduleValidation.IsInPast(pastManilaUnspecified, clock).Should().BeTrue();
        AppointmentScheduleValidation.IsInPast(graceManilaUnspecified, clock).Should().BeFalse();
        AppointmentScheduleValidation.IsInPast(futureManilaUnspecified, clock).Should().BeFalse();

        // Manila midnight boundary: 2026-11-18T16:30:00Z == 2026-11-19 00:30:00 Asia/Manila
        var midnightUtcNow = new DateTime(2026, 11, 18, 16, 30, 0, DateTimeKind.Utc);
        var midnightClock = new FixedTimeProvider(midnightUtcNow);

        var manilaPast = new DateTime(2026, 11, 19, 0, 15, 0, DateTimeKind.Unspecified); // 16:15Z (-15m)
        var manilaFuture = new DateTime(2026, 11, 19, 0, 45, 0, DateTimeKind.Unspecified); // 16:45Z (+15m)

        AppointmentScheduleValidation.IsInPast(manilaPast, midnightClock).Should().BeTrue();
        AppointmentScheduleValidation.IsInPast(manilaFuture, midnightClock).Should().BeFalse();

        // Utc preserved, Local converted
        var utcInput = new DateTime(2026, 11, 19, 8, 0, 0, DateTimeKind.Utc);
        AppointmentScheduleValidation.NormalizeToUtc(utcInput).Should().Be(utcInput);

        var localInput = DateTime.SpecifyKind(new DateTime(2026, 11, 19, 10, 0, 0), DateTimeKind.Local);
        AppointmentScheduleValidation.NormalizeToUtc(localInput).Should().Be(localInput.ToUniversalTime());
    }

    [Fact]
    public void CreateAppointmentCommandValidator_ValidatesScheduleAndRequiredFields()
    {
        var utcNow = new DateTime(2026, 11, 19, 6, 0, 0, DateTimeKind.Utc);
        var validator = new CreateAppointmentCommandValidator(new FixedTimeProvider(utcNow));

        var pastCmd = new CreateAppointmentCommand(Guid.NewGuid(), "Maria Santos", null, null, utcNow.AddMinutes(-6));
        var pastResult = validator.Validate(pastCmd);
        pastResult.IsValid.Should().BeFalse();
        pastResult.Errors.Should().ContainSingle(e =>
            e.PropertyName == nameof(CreateAppointmentCommand.ScheduledAt) &&
            e.ErrorMessage == "Cannot schedule an appointment for a time that has already passed.");

        // Within 5m grace, exact 5m boundary, future same-day, future date
        validator.Validate(pastCmd with { ScheduledAt = utcNow.AddMinutes(-4) }).IsValid.Should().BeTrue();
        validator.Validate(pastCmd with { ScheduledAt = utcNow.AddMinutes(-5) }).IsValid.Should().BeTrue();
        validator.Validate(pastCmd with { ScheduledAt = utcNow.AddHours(2) }).IsValid.Should().BeTrue();
        validator.Validate(pastCmd with { ScheduledAt = utcNow.AddDays(3) }).IsValid.Should().BeTrue();

        // default(DateTime) cascades and emits single error
        var defaultRes = validator.Validate(pastCmd with { ScheduledAt = default });
        defaultRes.IsValid.Should().BeFalse();
        defaultRes.Errors.Where(e => e.PropertyName == nameof(CreateAppointmentCommand.ScheduledAt))
            .Should().ContainSingle(e => e.ErrorMessage == "Scheduled date and time is required.");

        // Required patient and duration checks
        var invalidFieldsRes = validator.Validate(new CreateAppointmentCommand(Guid.Empty, "", null, null, utcNow.AddHours(1), DurationMinutes: 0));
        invalidFieldsRes.Errors.Should().Contain(e => e.PropertyName == nameof(CreateAppointmentCommand.PatientId));
        invalidFieldsRes.Errors.Should().Contain(e => e.PropertyName == nameof(CreateAppointmentCommand.PatientName));
        invalidFieldsRes.Errors.Should().Contain(e => e.PropertyName == nameof(CreateAppointmentCommand.DurationMinutes));
    }

    [Fact]
    public void RescheduleAppointmentCommandValidator_ValidatesScheduleAndOptionalDuration()
    {
        var utcNow = new DateTime(2026, 11, 19, 6, 0, 0, DateTimeKind.Utc);
        var validator = new RescheduleAppointmentCommandValidator(new FixedTimeProvider(utcNow));

        var pastCmd = new RescheduleAppointmentCommand(Guid.NewGuid(), utcNow.AddMinutes(-6));
        var pastResult = validator.Validate(pastCmd);
        pastResult.IsValid.Should().BeFalse();
        pastResult.Errors.Should().ContainSingle(e =>
            e.PropertyName == nameof(RescheduleAppointmentCommand.NewScheduledAt) &&
            e.ErrorMessage == "Cannot reschedule an appointment to a time that has already passed.");

        // Within grace, exact boundary, future same-day, future date, null DurationMinutes
        validator.Validate(pastCmd with { NewScheduledAt = utcNow.AddMinutes(-4), DurationMinutes = null }).IsValid.Should().BeTrue();
        validator.Validate(pastCmd with { NewScheduledAt = utcNow.AddMinutes(-5) }).IsValid.Should().BeTrue();
        validator.Validate(pastCmd with { NewScheduledAt = utcNow.AddHours(3) }).IsValid.Should().BeTrue();
        validator.Validate(pastCmd with { NewScheduledAt = utcNow.AddDays(2) }).IsValid.Should().BeTrue();

        // default(DateTime), empty Id, DurationMinutes = 0 -> "DurationMinutes"
        var defaultRes = validator.Validate(new RescheduleAppointmentCommand(Guid.Empty, default, DurationMinutes: 0));
        defaultRes.IsValid.Should().BeFalse();
        defaultRes.Errors.Should().Contain(e => e.PropertyName == nameof(RescheduleAppointmentCommand.Id));
        defaultRes.Errors.Should().Contain(e => e.PropertyName == nameof(RescheduleAppointmentCommand.DurationMinutes));
        defaultRes.Errors.Where(e => e.PropertyName == nameof(RescheduleAppointmentCommand.NewScheduledAt))
            .Should().ContainSingle(e => e.ErrorMessage == "New scheduled date and time is required.");
    }

    [Fact]
    public void AddApplicationServices_RegistersTimeProviderAndValidators_WithValidateOnBuild()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(Guid.NewGuid());
        clinicContext.TenantId.Returns("tenant-di");
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddApplicationServices();
        services.AddSingleton(clinicContext);
        services.AddSingleton(uow);
        services.AddSingleton(Substitute.For<IAuditLogQueue>());
        services.AddSingleton(Substitute.For<IHttpContextAccessor>());
        services.AddSingleton(Substitute.For<IInteropPublisher>());
        services.AddSingleton(Substitute.For<IPhilHealthProxyClient>());
        services.AddSingleton(Substitute.For<IPharmacyGamotGateway>());
        services.AddSingleton(Substitute.For<IPatientRecordGateway>());
        services.AddSingleton(Substitute.For<ILabResultIntake>());
        services.AddSingleton(Substitute.For<IClinicStorageService>());
        services.AddSingleton(Substitute.For<IClinicEncryptionService>());
        services.AddSingleton(Substitute.For<IClinicDocumentPdfService>());
        services.AddSingleton(Substitute.For<IClinicCensusExcelService>());
        services.AddSingleton(Substitute.For<ISampleDocumentGenerator>());
        services.AddSingleton(Substitute.For<ClinicEz.Shared.Workspace.IWorkspaceProfileProvider>());
        services.AddSingleton(Substitute.For<ClinicEz.Clinic.Domain.Interfaces.IKioskAccessInvalidator>());
        services.AddSingleton(Substitute.For<ClinicEz.Clinic.Domain.Interfaces.IStaffAccessInvalidator>());
        services.AddSingleton(Substitute.For<ClinicEz.Shared.Licensing.IFacilityLicenseValidator>());
        services.AddSingleton<IRepository<Appointment>>(TestDbHelper.CreateRepository<Appointment>(db, sieve));
        services.AddSingleton<IRepository<FacilitySettings>>(TestDbHelper.CreateRepository<FacilitySettings>(db, sieve));
        services.AddSingleton<IRepository<Invoice>>(TestDbHelper.CreateRepository<Invoice>(db, sieve));
        services.AddSingleton<IRepository<StaffMember>>(TestDbHelper.CreateRepository<StaffMember>(db, sieve));
        services.AddSingleton<IRepository<ServiceItem>>(TestDbHelper.CreateRepository<ServiceItem>(db, sieve));
        services.AddSingleton<IRepository<DoctorScheduleTemplate>>(TestDbHelper.CreateRepository<DoctorScheduleTemplate>(db, sieve));

        using var sp = services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });
        using var scope = sp.CreateScope();
        scope.ServiceProvider.GetRequiredService<TimeProvider>().Should().BeSameAs(TimeProvider.System);
        scope.ServiceProvider.GetRequiredService<IValidator<CreateAppointmentCommand>>().Should().BeOfType<CreateAppointmentCommandValidator>();
        scope.ServiceProvider.GetRequiredService<IValidator<RescheduleAppointmentCommand>>().Should().BeOfType<RescheduleAppointmentCommandValidator>();

        // Partial container without TimeProvider also succeeds under ValidateOnBuild
        var partial = new ServiceCollection();
        partial.AddValidatorsFromAssemblyContaining<CreateAppointmentCommandValidator>();
        using var partialSp = partial.BuildServiceProvider(new ServiceProviderOptions { ValidateOnBuild = true, ValidateScopes = true });
        using var partialScope = partialSp.CreateScope();
        partialScope.ServiceProvider.GetRequiredService<IValidator<CreateAppointmentCommand>>().Should().BeOfType<CreateAppointmentCommandValidator>();
    }

    [Fact]
    public async Task MediatRPipeline_RejectsPastTimesWithValidationError400BeforeHandler_AndAllowsFutureTimes()
    {
        var utcNow = new DateTime(2026, 11, 19, 6, 0, 0, DateTimeKind.Utc); // 14:00 Manila
        var clock = new FixedTimeProvider(utcNow);

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(Guid.NewGuid());
        clinicContext.TenantId.Returns("tenant-pipeline");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var capturingUow = new CapturingUnitOfWork(uow);

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<TimeProvider>(clock);
        services.AddApplicationServices();
        services.AddSingleton(clinicContext);
        services.AddSingleton<IUnitOfWork>(capturingUow);
        services.AddSingleton(Substitute.For<IAuditLogQueue>());
        services.AddSingleton(Substitute.For<IHttpContextAccessor>());
        services.AddSingleton(Substitute.For<IAppointmentNotificationDispatcher>());
        services.AddSingleton<IRepository<Appointment>>(TestDbHelper.CreateRepository<Appointment>(db, sieve));
        services.AddSingleton<IRepository<FacilitySettings>>(TestDbHelper.CreateRepository<FacilitySettings>(db, sieve));
        services.AddSingleton<IRepository<Invoice>>(TestDbHelper.CreateRepository<Invoice>(db, sieve));
        services.AddSingleton<IRepository<StaffMember>>(TestDbHelper.CreateRepository<StaffMember>(db, sieve));
        services.AddSingleton<IRepository<ServiceItem>>(TestDbHelper.CreateRepository<ServiceItem>(db, sieve));
        services.AddSingleton<IRepository<DoctorScheduleTemplate>>(TestDbHelper.CreateRepository<DoctorScheduleTemplate>(db, sieve));

        using var sp = services.BuildServiceProvider();
        using var scope = sp.CreateScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();

        // 1. Past Create -> ValidationException before handler runs -> HTTP 400 VALIDATION_ERROR
        var pastCreate = new CreateAppointmentCommand(Guid.NewGuid(), "Juan Cruz", null, null, utcNow.AddMinutes(-10));
        var createEx = await Assert.ThrowsAsync<ValidationException>(() => sender.Send(pastCreate, CancellationToken.None));
        createEx.Errors.Should().ContainKey(nameof(CreateAppointmentCommand.ScheduledAt));
        capturingUow.SaveChangesCalls.Should().Be(0);
        (await db.Appointments.IgnoreQueryFilters().CountAsync()).Should().Be(0);

        var httpCreate = new DefaultHttpContext();
        httpCreate.Response.Body = new MemoryStream();
        (await new GlobalExceptionHandler().TryHandleAsync(httpCreate, createEx, CancellationToken.None)).Should().BeTrue();
        httpCreate.Response.StatusCode.Should().Be(StatusCodes.Status400BadRequest);
        httpCreate.Response.Body.Position = 0;
        using (var doc = await JsonDocument.ParseAsync(httpCreate.Response.Body))
        {
            doc.RootElement.GetProperty("errorCode").GetString().Should().Be("VALIDATION_ERROR");
            doc.RootElement.GetProperty("errors")[0].GetProperty("field").GetString().Should().Be("ScheduledAt");
            doc.RootElement.GetProperty("errors")[0].GetProperty("code").GetString().Should().Be("VALIDATION_ERROR");
        }

        // 2. Future Create (Unspecified Manila 15:30 -> 07:30Z) succeeds and normalizes to UTC
        var futureCreate = new CreateAppointmentCommand(
            Guid.NewGuid(), "Juan Cruz", null, null, new DateTime(2026, 11, 19, 15, 30, 0, DateTimeKind.Unspecified));
        var created = await sender.Send(futureCreate, CancellationToken.None);
        created.ScheduledAt.Should().Be(new DateTime(2026, 11, 19, 7, 30, 0, DateTimeKind.Utc));
        capturingUow.SaveChangesCalls.Should().Be(1);
        (await db.Appointments.IgnoreQueryFilters().CountAsync()).Should().Be(1);

        // 3. Past Reschedule -> ValidationException -> HTTP 400 VALIDATION_ERROR
        var pastReschedule = new RescheduleAppointmentCommand(created.Id, utcNow.AddMinutes(-15));
        var reschedEx = await Assert.ThrowsAsync<ValidationException>(() => sender.Send(pastReschedule, CancellationToken.None));
        reschedEx.Errors.Should().ContainKey(nameof(RescheduleAppointmentCommand.NewScheduledAt));
        capturingUow.SaveChangesCalls.Should().Be(1);

        var httpResched = new DefaultHttpContext();
        httpResched.Response.Body = new MemoryStream();
        (await new GlobalExceptionHandler().TryHandleAsync(httpResched, reschedEx, CancellationToken.None)).Should().BeTrue();
        httpResched.Response.StatusCode.Should().Be(StatusCodes.Status400BadRequest);
        httpResched.Response.Body.Position = 0;
        using (var doc = await JsonDocument.ParseAsync(httpResched.Response.Body))
        {
            doc.RootElement.GetProperty("errorCode").GetString().Should().Be("VALIDATION_ERROR");
            doc.RootElement.GetProperty("errors")[0].GetProperty("field").GetString().Should().Be("NewScheduledAt");
        }

        // 4. Future Reschedule (Unspecified Manila 16:45 -> 08:45Z) succeeds and persists normalized UTC
        var futureReschedule = new RescheduleAppointmentCommand(
            created.Id, new DateTime(2026, 11, 19, 16, 45, 0, DateTimeKind.Unspecified));
        var rescheduled = await sender.Send(futureReschedule, CancellationToken.None);
        rescheduled.ScheduledAt.Should().Be(new DateTime(2026, 11, 19, 8, 45, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void IsInPast_HandlesSubSecondGraceBoundary_AndLocalOffset()
    {
        // 2026-11-19T06:00:00Z == 2026-11-19T14:00:00+08:00 (Asia/Manila)
        var utcNow = new DateTime(2026, 11, 19, 6, 0, 0, DateTimeKind.Utc);
        var clock = new FixedTimeProvider(utcNow);

        // -5m00.001s is strictly before the 5-minute grace cutoff -> rejected (true)
        AppointmentScheduleValidation.IsInPast(utcNow.AddMinutes(-5).AddMilliseconds(-1), clock).Should().BeTrue();
        // Exact -5m00.000s boundary -> allowed (false)
        AppointmentScheduleValidation.IsInPast(utcNow.AddMinutes(-5), clock).Should().BeFalse();

        // Explicit +08:00 offset converted via DateTimeOffset -> DateTimeKind.Local (or UtcDateTime)
        var pastManilaOffset = DateTimeOffset.Parse("2026-11-19T13:54:59+08:00");
        AppointmentScheduleValidation.IsInPast(pastManilaOffset.UtcDateTime, clock).Should().BeTrue();

        var localPast = DateTime.SpecifyKind(pastManilaOffset.UtcDateTime.ToLocalTime(), DateTimeKind.Local);
        AppointmentScheduleValidation.NormalizeToUtc(localPast).Should().Be(pastManilaOffset.UtcDateTime);
        AppointmentScheduleValidation.IsInPast(localPast, clock).Should().BeTrue();

        var graceManilaOffset = DateTimeOffset.Parse("2026-11-19T13:55:00+08:00");
        var localGrace = DateTime.SpecifyKind(graceManilaOffset.UtcDateTime.ToLocalTime(), DateTimeKind.Local);
        AppointmentScheduleValidation.NormalizeToUtc(localGrace).Should().Be(graceManilaOffset.UtcDateTime);
        AppointmentScheduleValidation.IsInPast(localGrace, clock).Should().BeFalse();
    }
}
