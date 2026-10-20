using System;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Appointments;

public sealed class AppointmentsControllerRemindEndpointTests
{
    [Fact]
    public async Task SendAppointmentReminder_DelegatesToSenderAndReturnsOkApiResponse()
    {
        // Arrange
        var sender = Substitute.For<ISender>();
        var controller = new AppointmentsController(sender);

        var appointmentId = Guid.NewGuid();
        var expectedDto = new AppointmentDto(
            Id: appointmentId,
            TenantId: "tenant-1",
            ClinicId: Guid.NewGuid(),
            DraftId: null,
            PatientId: Guid.NewGuid(),
            PatientName: "Jose Rizal",
            DoctorId: Guid.NewGuid(),
            DoctorName: "Dr. Blumentritt",
            ScheduledAt: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            Status: AppointmentStatus.Confirmed,
            ServiceType: "Checkup",
            Reason: "Routine",
            Notes: null,
            CreatedAt: DateTime.UtcNow,
            AttachedFileIdsJson: "[]",
            ShareFieldsJson: "[]",
            SharedScopes: [],
            SharedItems: [],
            Reminder24hSent: false,
            Reminder2hSent: false,
            Reminder24hSentAt: null,
            Reminder2hSentAt: null,
            LastReminderSentAt: DateTime.UtcNow,
            LastReminderType: "manual");

        sender.Send(Arg.Is<SendAppointmentReminderCommand>(c => c.AppointmentId == appointmentId), Arg.Any<CancellationToken>())
            .Returns(expectedDto);

        // Act
        var actionResult = await controller.SendAppointmentReminder(appointmentId, CancellationToken.None);

        // Assert
        var okResult = actionResult.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<AppointmentDto>>().Subject;
        response.Succeeded.Should().BeTrue();
        response.Data.Should().BeEquivalentTo(expectedDto);
        response.Message.Should().Contain("reminder sent");
    }

    [Fact]
    public void SendAppointmentReminder_HasRequiredAttributes()
    {
        // Arrange
        var method = typeof(AppointmentsController).GetMethod(
            nameof(AppointmentsController.SendAppointmentReminder),
            [typeof(Guid), typeof(CancellationToken)]);

        method.Should().NotBeNull("SendAppointmentReminder method must exist on AppointmentsController");

        // Assert HttpPost with correct route template
        var httpPostAttr = method!.GetCustomAttribute<HttpPostAttribute>();
        httpPostAttr.Should().NotBeNull();
        httpPostAttr!.Template.Should().Be("{id:guid}/remind");

        // Assert HasPermission guard with AppointmentsManage permission
        var permissionAttr = method.GetCustomAttribute<HasPermissionAttribute>();
        permissionAttr.Should().NotBeNull();
        permissionAttr!.Permission.Should().Be(ClinicPermissions.AppointmentsManage);
    }
}
