using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/lab-orders")]
public sealed class LabOrdersController : ControllerBase
{
    private readonly ISender _sender;

    public LabOrdersController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.LabOrdersRead)]
    public async Task<ActionResult<ApiResponse<List<ClinicLabOrderDto>>>> GetLabOrders(
        [FromQuery] Guid? patientId,
        [FromQuery] LabOrderStatus? status,
        [FromQuery] DateTime? date,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicLabOrdersQuery(patientId, status, date), ct);
        return Ok(ApiResponse<List<ClinicLabOrderDto>>.Success(result));
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.LabOrdersWrite)]
    public async Task<ActionResult<ApiResponse<ClinicLabOrderDto>>> CreateLabOrder(
        [FromBody] CreateClinicLabOrderRequest request,
        CancellationToken ct)
    {
        var command = new CreateClinicLabOrderCommand(
            request.PatientId,
            request.PatientName,
            request.ConsultationId,
            request.OrderedByDoctorId,
            request.OrderedByDoctorName,
            request.ClinicalDiagnosis,
            request.Notes,
            request.Items
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicLabOrderDto>.Success(result, "Lab order created successfully."));
    }
}
