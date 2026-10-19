using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Procedures.Commands;
using ClinicEz.Clinic.Application.Features.Procedures.DTOs;
using ClinicEz.Clinic.Application.Features.Procedures.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/procedures")]
public sealed class ProceduresController : ControllerBase
{
    private readonly ISender _sender;

    public ProceduresController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.ProceduresRead)]
    public async Task<ActionResult<ApiResponse<List<ClinicalProcedureDto>>>> GetProcedures(
        [FromQuery] Guid? patientId,
        [FromQuery] ProcedureStatus? status,
        [FromQuery] DateTime? date,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetProceduresQuery(patientId, status, date), ct);
        return Ok(ApiResponse<List<ClinicalProcedureDto>>.Success(result));
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.ProceduresWrite)]
    public async Task<ActionResult<ApiResponse<ClinicalProcedureDto>>> OrderProcedure(
        [FromBody] OrderProcedureRequest request,
        CancellationToken ct)
    {
        var command = new OrderProcedureCommand(
            request.PatientId,
            request.PatientName,
            request.QueueItemId,
            request.ConsultationId,
            request.ProcedureCode,
            request.ProcedureName,
            request.Category,
            request.OrderedByDoctorId,
            request.OrderedByDoctorName,
            request.ClinicalNotes,
            request.TargetRoomId,
            request.TargetRoomName,
            request.ToothNumber,
            request.ToothSurface
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicalProcedureDto>.Success(result, "Procedure ordered successfully."));
    }

    [HttpPost("{id:guid}/complete")]
    [HasPermission(ClinicPermissions.ProceduresWrite)]
    public async Task<ActionResult<ApiResponse<ClinicalProcedureDto>>> CompleteProcedure(
        Guid id,
        [FromBody] RecordProcedureExecutionRequest request,
        CancellationToken ct)
    {
        var command = new RecordProcedureExecutionCommand(
            id,
            request.PerformedByStaffId,
            request.PerformedByStaffName,
            request.PreProcedureVitalsJson,
            request.PostProcedureVitalsJson,
            request.MedicationAdministered,
            request.LotNumber,
            request.ExpirationDate,
            request.SiteRoute,
            request.ClinicalNotes,
            request.Complications
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicalProcedureDto>.Success(result, "Procedure completed successfully."));
    }
}
