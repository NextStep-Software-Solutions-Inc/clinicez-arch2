using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Application.Features.Teleconsult.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

public sealed record UpdateTeleconsultPaymentPolicyRequest(
    TeleconsultPaymentPolicy PaymentPolicy);

public sealed record EndTeleconsultCallRequest(
    string? EndReason = null);

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

    /// <summary>
    /// Updates the teleconsultation payment policy (Prepaid, Postpaid, Exempt) for an appointment.
    /// Accessible by receptionists/scheduling staff and attending clinicians.
    /// </summary>
    [HttpPut("appointments/{appointmentId:guid}/payment-policy")]
    [HasAnyPermission(ClinicPermissions.AppointmentsManage, ClinicPermissions.ConsultationsWrite)]
    public async Task<ActionResult<ApiResponse<TeleconsultStatusDto>>> UpdatePaymentPolicy(
        Guid appointmentId,
        [FromBody] UpdateTeleconsultPaymentPolicyRequest request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new UpdateTeleconsultPaymentPolicyCommand(appointmentId, request.PaymentPolicy), ct);
        return Ok(ApiResponse<TeleconsultStatusDto>.Success(result, "Teleconsultation payment policy updated successfully."));
    }

    /// <summary>
    /// Joins an admitted teleconsultation call, requesting zero-PHI LiveKit room tokens from the media broker.
    /// Gracefully falls back to offline signaling mode if the media broker is unreachable.
    /// </summary>
    [HttpPost("appointments/{appointmentId:guid}/join")]
    [HasAnyPermission(ClinicPermissions.ConsultationsWrite, ClinicPermissions.ConsultationsSign)]
    public async Task<ActionResult<ApiResponse<TeleconsultCallJoinDto>>> JoinCall(
        Guid appointmentId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new JoinTeleconsultCallCommand(appointmentId), ct);
        return Ok(ApiResponse<TeleconsultCallJoinDto>.Success(result, "Joined teleconsultation call successfully."));
    }

    /// <summary>
    /// Ends an active teleconsultation call, transitioning appointment status to Completed,
    /// auto-finalizing any active recording sessions, and emitting comms.call.state.changed.
    /// </summary>
    [HttpPost("appointments/{appointmentId:guid}/end")]
    [HasAnyPermission(ClinicPermissions.ConsultationsWrite, ClinicPermissions.ConsultationsSign)]
    public async Task<ActionResult<ApiResponse<TeleconsultCallEndResultDto>>> EndCall(
        Guid appointmentId,
        [FromBody] EndTeleconsultCallRequest? request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new EndTeleconsultCallCommand(appointmentId, request?.EndReason), ct);
        return Ok(ApiResponse<TeleconsultCallEndResultDto>.Success(result, "Teleconsultation call ended successfully."));
    }

    /// <summary>
    /// Generates a secure cryptographic guest invitation link, 6-digit OTP, and DOB hint for
    /// third-party or browser guest access, publishing GuestTeleconsultInviteIssued to Party.Portal.
    /// </summary>
    [HttpPost("appointments/{appointmentId:guid}/guest-invite")]
    [HasAnyPermission(ClinicPermissions.ConsultationsWrite, ClinicPermissions.ConsultationsSign, ClinicPermissions.AppointmentsManage)]
    public async Task<ActionResult<ApiResponse<TeleconsultGuestInviteDto>>> CreateGuestInvite(
        Guid appointmentId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new CreateTeleconsultGuestInviteCommand(appointmentId), ct);
        return Ok(ApiResponse<TeleconsultGuestInviteDto>.Success(result, "Teleconsultation guest invite created successfully."));
    }
}
