using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Requisitions.Commands;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Application.Features.Requisitions.Queries;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Laboratory.Api.Controllers;

[ApiController]
[Route("api/v1/requisitions")]
public sealed class RequisitionsController : ControllerBase
{
    private readonly ISender _sender;

    public RequisitionsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<LabRequisitionDto>>>> GetWorklist(
        [FromQuery] string? status,
        [FromQuery] string? searchTerm,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetWorklistQuery(status, searchTerm, pageNumber, pageSize), ct);
        return Ok(ApiResponse<List<LabRequisitionDto>>.Success(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<LabRequisitionDto>>> GetById(
        [FromRoute] Guid id,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetRequisitionByIdQuery(Id: id), ct);
        if (result == null)
            return NotFound(ApiResponse<LabRequisitionDto>.Fail($"Requisition with ID {id} not found."));

        return Ok(ApiResponse<LabRequisitionDto>.Success(result));
    }

    [HttpGet("by-accession/{accessionNumber}")]
    public async Task<ActionResult<ApiResponse<LabRequisitionDto>>> GetByAccession(
        [FromRoute] string accessionNumber,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetRequisitionByIdQuery(AccessionNumber: accessionNumber), ct);
        if (result == null)
            return NotFound(ApiResponse<LabRequisitionDto>.Fail($"Requisition with Accession Number '{accessionNumber}' not found."));

        return Ok(ApiResponse<LabRequisitionDto>.Success(result));
    }

    [HttpPost("{id:guid}/accession")]
    public async Task<ActionResult<ApiResponse<LabRequisitionDto>>> AccessionSpecimen(
        [FromRoute] Guid id,
        [FromBody] AccessionSpecimenRequest request,
        CancellationToken ct = default)
    {
        var command = new AccessionSpecimenCommand(id, request.PhlebotomistName, request.Specimens);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<LabRequisitionDto>.Success(result));
    }
}

public record AccessionSpecimenRequest
{
    public string PhlebotomistName { get; init; } = "Phlebotomist";
    public List<SpecimenAccessionInput> Specimens { get; init; } = new();
}
