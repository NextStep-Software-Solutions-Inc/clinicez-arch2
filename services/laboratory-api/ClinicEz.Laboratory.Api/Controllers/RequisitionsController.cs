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
        [FromQuery] string? branchId = null,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetWorklistQuery(status, searchTerm, branchId, pageNumber, pageSize), ct);
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

    [HttpGet("{id:guid}/stickers")]
    public async Task<ActionResult<ApiResponse<List<PrintableTubeStickerDto>>>> GetTubeStickers(
        [FromRoute] Guid id,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetPrintableStickersQuery(RequisitionId: id), ct);
        return Ok(ApiResponse<List<PrintableTubeStickerDto>>.Success(result));
    }

    [HttpPost("{id:guid}/specimens/{specimenId:guid}/reject")]
    public async Task<ActionResult<ApiResponse<LabRequisitionDto>>> RejectSpecimen(
        [FromRoute] Guid id,
        [FromRoute] Guid specimenId,
        [FromBody] RejectSpecimenRequest request,
        CancellationToken ct = default)
    {
        var command = new RejectSpecimenCommand(id, specimenId, request.ReasonCode, request.Notes, request.PhlebotomistName, request.CorrectiveAction);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<LabRequisitionDto>.Success(result));
    }

    [HttpPost("{id:guid}/specimens/{specimenId:guid}/store")]
    public async Task<ActionResult<ApiResponse<LabRequisitionDto>>> StoreSpecimen(
        [FromRoute] Guid id,
        [FromRoute] Guid specimenId,
        [FromBody] StoreSpecimenRequest request,
        CancellationToken ct = default)
    {
        var command = new StoreSpecimenCommand(id, specimenId, request.RackId, request.RackPosition, request.Temperature);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<LabRequisitionDto>.Success(result));
    }

    [HttpGet("racks")]
    public async Task<ActionResult<ApiResponse<List<RackInventoryItemDto>>>> GetRackInventory(
        [FromQuery] string? rackId,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetRackInventoryQuery(rackId), ct);
        return Ok(ApiResponse<List<RackInventoryItemDto>>.Success(result));
    }
}

public record AccessionSpecimenRequest
{
    public string PhlebotomistName { get; init; } = "Phlebotomist";
    public List<SpecimenAccessionInput> Specimens { get; init; } = new();
}

public record RejectSpecimenRequest
{
    public required string ReasonCode { get; init; }
    public string? Notes { get; init; }
    public string? PhlebotomistName { get; init; }
    public string? CorrectiveAction { get; init; }
}

public record StoreSpecimenRequest
{
    public required string RackId { get; init; }
    public required string RackPosition { get; init; }
    public string? Temperature { get; init; }
}
