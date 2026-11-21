using System;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Middlewares;
using ClinicEz.Shared.Workspace;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Appointments;

public sealed class SendAppointmentReminderCommandTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-reminders-tz";
    private readonly IClinicContext _clinicContext;

    public SendAppointmentReminderCommandTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffName.Returns("Nurse Clara");
    }

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        private readonly DateTimeOffset _utcNow = new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
        public override DateTimeOffset GetUtcNow() => _utcNow;
    }

    [Theory]
    [InlineData(AppointmentStatus.Completed)]
    [InlineData(AppointmentStatus.Cancelled)]
    [InlineData(AppointmentStatus.NoShow)]
    public async Task Handle_WhenTerminalOrNoShowStatus_ThrowsValidationExceptionMappedToHttp400(AppointmentStatus status)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var nowUtc = new DateTime(2026, 11, 18, 4, 0, 0, DateTimeKind.Utc); // 12:00 PM Asia/Manila
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Clara",
            ScheduledAt = nowUtc.AddHours(2),
            DurationMinutes = 30,
            Status = status
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(
            repo, uow, _clinicContext, dispatcher, settingsRepo: settingsRepo, timeProvider: new FixedTimeProvider(nowUtc));

        var ex = await Assert.ThrowsAsync<ValidationException>(() =>
            handler.Handle(new SendAppointmentReminderCommand(appointment.Id), CancellationToken.None));

        ex.Message.Should().Be($"Cannot send reminder for an appointment with status '{status}'.");
        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());

        // Verify GlobalExceptionHandler maps ValidationException to HTTP 400
        var httpContext = new DefaultHttpContext();
        httpContext.Response.Body = new MemoryStream();
        var handled = await new GlobalExceptionHandler().TryHandleAsync(httpContext, ex, CancellationToken.None);
        handled.Should().BeTrue();
        httpContext.Response.StatusCode.Should().Be(StatusCodes.Status400BadRequest);
    }

    [Fact]
    public async Task Handle_WhenPastDateAcrossAsiaManilaMidnightBoundary_ThrowsValidationException()
    {
        // 2026-11-18 16:30 UTC == 2026-11-19 00:30 Asia/Manila (already Nov 19 in clinic TZ)
        // 2026-11-18 15:30 UTC == 2026-11-18 23:30 Asia/Manila (same UTC date, but YESTERDAY in Asia/Manila!)
        var nowUtc = new DateTime(2026, 11, 18, 16, 30, 0, DateTimeKind.Utc);
        var scheduledAtUtc = new DateTime(2026, 11, 18, 15, 30, 0, DateTimeKind.Utc);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        await settingsRepo.AddAsync(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Manila Family Clinic",
            TimeZoneId = "Asia/Manila"
        });

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            ScheduledAt = scheduledAtUtc,
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(
            repo, uow, _clinicContext, dispatcher, settingsRepo: settingsRepo, timeProvider: new FixedTimeProvider(nowUtc));

        var ex = await Assert.ThrowsAsync<ValidationException>(() =>
            handler.Handle(new SendAppointmentReminderCommand(appointment.Id), CancellationToken.None));

        ex.Message.Should().Be("Cannot send reminder for a past-date appointment.");
        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenSameDayLateActiveAppointmentInAsiaManila_AllowsManualReminder()
    {
        // 2026-11-18 16:30 UTC == 2026-11-19 00:30 Asia/Manila
        // 2026-11-18 16:05 UTC == 2026-11-19 00:05 Asia/Manila (25 mins late, SAME calendar day Nov 19)
        var nowUtc = new DateTime(2026, 11, 18, 16, 30, 0, DateTimeKind.Utc);
        var scheduledAtUnspecified = new DateTime(2026, 11, 18, 16, 5, 0, DateTimeKind.Unspecified);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        await settingsRepo.AddAsync(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Manila Family Clinic",
            TimeZoneId = "Asia/Manila"
        });

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Josefa Escoda",
            ScheduledAt = scheduledAtUnspecified,
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(
            repo, uow, _clinicContext, dispatcher, settingsRepo: settingsRepo, timeProvider: new FixedTimeProvider(nowUtc));

        var result = await handler.Handle(new SendAppointmentReminderCommand(appointment.Id), CancellationToken.None);

        result.Should().NotBeNull();
        result.LastReminderType.Should().Be("manual");
        result.LastReminderSentAt.Should().Be(nowUtc);
        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appointment.Id),
            AppointmentAlertKinds.ManualReminder,
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenFacilityTimeZoneUnset_FallsBackToWorkspaceProfileTimeZone()
    {
        // 2026-11-19 02:00 UTC == 2026-11-18 21:00 America/New_York (EST, UTC-5)
        // 2026-11-18 14:00 UTC == 2026-11-18 09:00 America/New_York -> same day Nov 18 in NY, even though Nov 19 in UTC & Manila!
        var nowUtc = new DateTime(2026, 11, 19, 2, 0, 0, DateTimeKind.Utc);
        var scheduledAtUtc = new DateTime(2026, 11, 18, 14, 0, 0, DateTimeKind.Utc);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var workspaceProfiles = Substitute.For<IWorkspaceProfileProvider>();
        workspaceProfiles.GetAsync(_tenantId, Arg.Any<CancellationToken>())
            .Returns(new WorkspaceProfile(
                TenantSlug: "ny-workspace",
                Version: 1,
                DisplayName: "NY Clinic Network",
                LogoUrl: null,
                AccentColorHex: null,
                TimeZoneId: "America/New_York",
                Locale: "en-US",
                DateFormat: "MM/dd/yyyy",
                CurrencyCode: "USD"));

        await settingsRepo.AddAsync(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Manhattan Clinic",
            TimeZoneId = null
        });

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Alex Reyes",
            ScheduledAt = scheduledAtUtc,
            Status = AppointmentStatus.Pending
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(
            repo,
            uow,
            _clinicContext,
            settingsRepo: settingsRepo,
            workspaceProfiles: workspaceProfiles,
            timeProvider: new FixedTimeProvider(nowUtc));

        var result = await handler.Handle(new SendAppointmentReminderCommand(appointment.Id), CancellationToken.None);

        result.LastReminderType.Should().Be("manual");
        result.LastReminderSentAt.Should().Be(nowUtc);
    }

    [Theory]
    [InlineData(AppointmentStatus.Pending)]
    [InlineData(AppointmentStatus.Confirmed)]
    [InlineData(AppointmentStatus.CheckedIn)]
    [InlineData(AppointmentStatus.InConsultation)]
    public async Task Handle_WhenSameDayLateActiveTeleconsultAcrossActiveStatusesInAsiaManila_AllowsManualReminder(AppointmentStatus status)
    {
        // 2026-11-18 16:30 UTC == 2026-11-19 00:30 Asia/Manila
        // 2026-11-18 16:05 UTC == 2026-11-19 00:05 Asia/Manila (25 mins late, SAME calendar day Nov 19)
        var nowUtc = new DateTime(2026, 11, 18, 16, 30, 0, DateTimeKind.Utc);
        var scheduledAtUtc = new DateTime(2026, 11, 18, 16, 5, 0, DateTimeKind.Utc);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        await settingsRepo.AddAsync(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Manila Telehealth Clinic",
            TimeZoneId = "Asia/Manila"
        });

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Melchora Aquino",
            ScheduledAt = scheduledAtUtc,
            Status = status,
            AppointmentType = AppointmentType.Teleconsult
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(
            repo, uow, _clinicContext, dispatcher, settingsRepo: settingsRepo, timeProvider: new FixedTimeProvider(nowUtc));

        var result = await handler.Handle(new SendAppointmentReminderCommand(appointment.Id), CancellationToken.None);

        result.Should().NotBeNull();
        result.Status.Should().Be(status);
        result.IsTeleconsult.Should().BeTrue();
        result.LastReminderType.Should().Be("manual");
        result.LastReminderSentAt.Should().Be(nowUtc);
        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appointment.Id),
            AppointmentAlertKinds.ManualReminder,
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenSymmetricAsiaManilaBoundary_PreviousUtcDateSameManilaDay_AllowsManualReminder()
    {
        // 2026-11-19 15:00 UTC == 2026-11-19 23:00 Asia/Manila (Nov 19 in Manila)
        // 2026-11-18 17:00 UTC == 2026-11-19 01:00 Asia/Manila (previous UTC date Nov 18, SAME Manila calendar day Nov 19!)
        var nowUtc = new DateTime(2026, 11, 19, 15, 0, 0, DateTimeKind.Utc);
        var scheduledAtUtc = new DateTime(2026, 11, 18, 17, 0, 0, DateTimeKind.Utc);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        await settingsRepo.AddAsync(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Manila Family Clinic",
            TimeZoneId = "Asia/Manila"
        });

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Marcelo H. Del Pilar",
            ScheduledAt = scheduledAtUtc,
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(
            repo, uow, _clinicContext, dispatcher, settingsRepo: settingsRepo, timeProvider: new FixedTimeProvider(nowUtc));

        var result = await handler.Handle(new SendAppointmentReminderCommand(appointment.Id), CancellationToken.None);

        result.Should().NotBeNull();
        result.LastReminderType.Should().Be("manual");
        result.LastReminderSentAt.Should().Be(nowUtc);
        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appointment.Id),
            AppointmentAlertKinds.ManualReminder,
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAndGetById_WhenAppointmentIsSoftDeleted_ThrowsNotFoundException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var nowUtc = new DateTime(2026, 11, 19, 4, 0, 0, DateTimeKind.Utc);
        var softDeleted = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Soft Deleted Patient",
            ScheduledAt = nowUtc.AddHours(4),
            Status = AppointmentStatus.Confirmed,
            IsDeleted = true
        };
        await repo.AddAsync(softDeleted);
        await uow.SaveChangesAsync();

        var remindHandler = new SendAppointmentReminderCommandHandler(
            repo, uow, _clinicContext, dispatcher, settingsRepo: settingsRepo, timeProvider: new FixedTimeProvider(nowUtc));
        var getByIdHandler = new GetAppointmentByIdQueryHandler(repo, _clinicContext);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            remindHandler.Handle(new SendAppointmentReminderCommand(softDeleted.Id), CancellationToken.None));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            getByIdHandler.Handle(new GetAppointmentByIdQuery(softDeleted.Id), CancellationToken.None));

        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GetAppointmentByIdQueryHandler_WhenExistsInClinic_ReturnsAppointmentDto()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Paterno",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Santos",
            ScheduledAt = new DateTime(2026, 11, 20, 9, 0, 0, DateTimeKind.Utc),
            DurationMinutes = 30,
            Status = AppointmentStatus.Completed,
            Reminder24hSent = true,
            LastReminderType = "24h"
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new GetAppointmentByIdQueryHandler(repo, _clinicContext);
        var dto = await handler.Handle(new GetAppointmentByIdQuery(appointment.Id), CancellationToken.None);

        dto.Id.Should().Be(appointment.Id);
        dto.ClinicId.Should().Be(_clinicId);
        dto.PatientName.Should().Be("Pedro Paterno");
        dto.Status.Should().Be(AppointmentStatus.Completed);
        dto.Reminder24hSent.Should().BeTrue();
        dto.LastReminderType.Should().Be("24h");
    }

    [Fact]
    public async Task GetAppointmentByIdQueryHandler_WhenNotFoundOrClinicMismatch_ThrowsNotFoundException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var foreignAppointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = Guid.NewGuid(),
            TenantId = "other-tenant",
            PatientId = Guid.NewGuid(),
            PatientName = "Foreign Patient",
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(foreignAppointment);
        await uow.SaveChangesAsync();

        var handler = new GetAppointmentByIdQueryHandler(repo, _clinicContext);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.Handle(new GetAppointmentByIdQuery(Guid.NewGuid()), CancellationToken.None));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.Handle(new GetAppointmentByIdQuery(foreignAppointment.Id), CancellationToken.None));
    }

    [Fact]
    public async Task AppointmentsController_GetAppointmentById_HasReadPermissionAndReturnsOkResponse()
    {
        var method = typeof(AppointmentsController).GetMethod(
            nameof(AppointmentsController.GetAppointmentById),
            [typeof(Guid), typeof(CancellationToken)]);
        method.Should().NotBeNull();

        var httpGet = method!.GetCustomAttribute<HttpGetAttribute>();
        httpGet.Should().NotBeNull();
        httpGet!.Template.Should().Be("{id:guid}");

        var permission = method.GetCustomAttribute<HasPermissionAttribute>();
        permission.Should().NotBeNull();
        permission!.Permission.Should().Be(ClinicPermissions.AppointmentsRead);

        var sender = Substitute.For<ISender>();
        var controller = new AppointmentsController(sender);
        var appointmentId = Guid.NewGuid();
        var expected = new AppointmentDto(
            Id: appointmentId,
            TenantId: _tenantId,
            ClinicId: _clinicId,
            DraftId: null,
            PatientId: Guid.NewGuid(),
            PatientName: "Maria Clara",
            DoctorId: null,
            DoctorName: null,
            ScheduledAt: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            Status: AppointmentStatus.Confirmed,
            ServiceType: null,
            Reason: null,
            Notes: null,
            CreatedAt: DateTime.UtcNow,
            AttachedFileIdsJson: "[]",
            ShareFieldsJson: "[]",
            SharedScopes: [],
            SharedItems: []);

        sender.Send(Arg.Is<GetAppointmentByIdQuery>(q => q.AppointmentId == appointmentId), Arg.Any<CancellationToken>())
            .Returns(expected);

        var actionResult = await controller.GetAppointmentById(appointmentId, CancellationToken.None);
        var okResult = actionResult.Result.Should().BeOfType<OkObjectResult>().Subject;
        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<AppointmentDto>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();
        apiResponse.Data.Should().BeEquivalentTo(expected);
    }
}
