using System;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Appointments;

public sealed class MarkAppointmentNoShowCommandTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "test-tenant-noshow";
    private readonly IClinicContext _clinicContext;

    private sealed class FixedTimeProvider(DateTime utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc));
    }

    public MarkAppointmentNoShowCommandTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffName.Returns("Dr. Elena Reyes");
    }

    [Theory]
    [InlineData(AppointmentStatus.Pending)]
    [InlineData(AppointmentStatus.Confirmed)]
    public async Task Handle_ValidUnresolvedStatus_MarksNoShowUpdatesAuditFieldsAndRevokesComms(AppointmentStatus initialStatus)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var fixedNow = new DateTime(2026, 11, 20, 10, 30, 0, DateTimeKind.Utc);

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Santos",
            ScheduledAt = fixedNow.AddMinutes(-30),
            DurationMinutes = 30,
            Status = initialStatus,
            Notes = "Initial booking"
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new MarkAppointmentNoShowCommandHandler(
            repo, uow, _clinicContext, publisher, new FixedTimeProvider(fixedNow));

        var result = await handler.Handle(
            new MarkAppointmentNoShowCommand(appointment.Id, "Patient unreachable after 15 mins"),
            CancellationToken.None);

        result.Status.Should().Be(AppointmentStatus.NoShow);
        result.UpdatedAt.Should().Be(fixedNow);
        result.UpdatedBy.Should().Be("Dr. Elena Reyes");
        result.Notes.Should().Be("Initial booking | No-Show: Patient unreachable after 15 mins");

        var persisted = await repo.GetByIdAsync(appointment.Id);
        persisted.Should().NotBeNull();
        persisted!.Status.Should().Be(AppointmentStatus.NoShow);
        persisted.UpdatedAt.Should().Be(fixedNow);
        persisted.UpdatedBy.Should().Be("Dr. Elena Reyes");

        publisher.Received(1).Enqueue(
            InteropTypes.CommsEligibilityRevoked,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            Arg.Any<Guid>(),
            Arg.Is<CommsEligibilityRevokedPayload>(p =>
                p.PatientId == appointment.PatientId &&
                p.Reason == "Patient unreachable after 15 mins"));
    }

    [Theory]
    [InlineData(AppointmentStatus.CheckedIn)]
    [InlineData(AppointmentStatus.InConsultation)]
    [InlineData(AppointmentStatus.Completed)]
    [InlineData(AppointmentStatus.Cancelled)]
    [InlineData(AppointmentStatus.NoShow)]
    public async Task Handle_InvalidOrTerminalStatus_ThrowsConflictException(AppointmentStatus invalidStatus)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Clara",
            ScheduledAt = DateTime.UtcNow.AddHours(-1),
            Status = invalidStatus
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new MarkAppointmentNoShowCommandHandler(repo, uow, _clinicContext);

        var act = async () => await handler.Handle(new MarkAppointmentNoShowCommand(appointment.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage($"*{invalidStatus}*");
    }

    [Fact]
    public async Task Handle_AppointmentNotFoundOrDifferentClinic_ThrowsNotFoundException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var handler = new MarkAppointmentNoShowCommandHandler(repo, uow, _clinicContext);

        var act = async () => await handler.Handle(new MarkAppointmentNoShowCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task AppointmentsController_MarkAppointmentNoShow_DelegatesToSenderAndHasExpectedRouteAndPermission()
    {
        var sender = Substitute.For<ISender>();
        var controller = new AppointmentsController(sender);
        var appointmentId = Guid.NewGuid();
        var expectedDto = new AppointmentDto(
            Id: appointmentId,
            TenantId: _tenantId,
            ClinicId: _clinicId,
            DraftId: null,
            PatientId: Guid.NewGuid(),
            PatientName: "Jose Rizal",
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Blumentritt",
            ScheduledAt: DateTime.UtcNow.AddHours(-1),
            DurationMinutes: 30,
            Status: AppointmentStatus.NoShow,
            ServiceType: "Consultation",
            Reason: "Routine",
            Notes: "No-Show: Unreachable",
            CreatedAt: DateTime.UtcNow.AddDays(-1),
            AttachedFileIdsJson: "[]",
            ShareFieldsJson: "[]",
            SharedScopes: [],
            SharedItems: [],
            UpdatedAt: DateTime.UtcNow,
            UpdatedBy: "Dr. Elena Reyes");

        sender.Send(
                Arg.Is<MarkAppointmentNoShowCommand>(c => c.Id == appointmentId && c.Reason == "Unreachable"),
                Arg.Any<CancellationToken>())
            .Returns(expectedDto);

        var actionResult = await controller.MarkAppointmentNoShow(
            appointmentId,
            new MarkAppointmentNoShowRequest("Unreachable"),
            CancellationToken.None);

        var okResult = actionResult.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<AppointmentDto>>().Subject;
        response.Succeeded.Should().BeTrue();
        response.Data!.Status.Should().Be(AppointmentStatus.NoShow);

        var method = typeof(AppointmentsController).GetMethod(
            nameof(AppointmentsController.MarkAppointmentNoShow),
            [typeof(Guid), typeof(MarkAppointmentNoShowRequest), typeof(CancellationToken)]);
        method.Should().NotBeNull();

        var httpPut = method!.GetCustomAttribute<HttpPutAttribute>();
        httpPut.Should().NotBeNull();
        httpPut!.Template.Should().Be("{id:guid}/no-show");

        var permission = method.GetCustomAttribute<HasPermissionAttribute>();
        permission.Should().NotBeNull();
        permission!.Permission.Should().Be(ClinicPermissions.AppointmentsManage);
    }

    [Fact]
    public void AuditRequestMetadataRegistry_ResolvesMarkAppointmentNoShowCommand()
    {
        var descriptor = AuditRequestMetadataRegistry.GetDescriptor<MarkAppointmentNoShowCommand>();
        descriptor.IsAuditable.Should().BeTrue();
        descriptor.Category.Should().Be(ClinicAuditCategories.Appointments);
        descriptor.Action.Should().Be("appointments.appointment.no_show");
        descriptor.Severity.Should().Be(ClinicAuditSeverities.Urgent);
        descriptor.TargetEntityType.Should().Be("Appointment");
    }
}
