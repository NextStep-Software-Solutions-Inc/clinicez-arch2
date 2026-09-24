using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/appointments")]
public sealed class AppointmentsController : ControllerBase
{
    private readonly ISender _sender;

    public AppointmentsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.AppointmentsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<AppointmentDto>>>> GetAppointments(
        [FromQuery] DateOnly? date,
        [FromQuery] AppointmentStatus? status,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetAppointmentsQuery(date, status), ct);
        return Ok(ApiResponse<IReadOnlyList<AppointmentDto>>.Success(result));
    }
}
