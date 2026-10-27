using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Application.Features.Teleconsult.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/teleconsult")]
public sealed class TeleconsultAdmissionController : ControllerBase
{
    private readonly ISender _sender;

    public TeleconsultAdmissionController(ISender sender)
    {
        _sender = sender;
    }

    /// <summary>
    /// Admits a patient from the virtual waiting room into the teleconsultation session.
    /// Strictly guarded by the teleconsult prepayment gate and PhilHealth Konsulta YAKAP exemption engine.
    /// </summary>
    [HttpPost("admit")]
    [HasPermission(ClinicPermissions.ConsultationsWrite)]
    public async Task<ActionResult<ApiResponse<TeleconsultAdmissionResultDto>>> AdmitPatient(
        [FromBody] AdmitTeleconsultPatientCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<TeleconsultAdmissionResultDto>.Success(result, "Patient admitted to teleconsultation session."));
    }

    /// <summary>
    /// Retrieves live teleconsultation admission status, payment gate state, and YAKAP eligibility.
    /// </summary>
    [HttpGet("appointments/{appointmentId:guid}/status")]
    [HasPermission(ClinicPermissions.AppointmentsRead)]
    public async Task<ActionResult<ApiResponse<TeleconsultStatusDto>>> GetTeleconsultStatus(
        Guid appointmentId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetTeleconsultStatusQuery(appointmentId), ct);
        return Ok(ApiResponse<TeleconsultStatusDto>.Success(result));
    }
}
