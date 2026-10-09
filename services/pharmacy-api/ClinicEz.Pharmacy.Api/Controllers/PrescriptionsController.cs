using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Api.Authorization;
using ClinicEz.Pharmacy.Application.Common;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.DTOs;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Queries;
using ClinicEz.Pharmacy.Domain.Constants;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Pharmacy.Api.Controllers;

[ApiController]
[Route("api/v1/prescriptions")]
public sealed class PrescriptionsController : ControllerBase
{
    private readonly ISender _sender;

    public PrescriptionsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(PharmacyPermissions.PrescriptionsRead)]
    public async Task<ActionResult<ApiResponse<List<PrescriptionOrderDto>>>> GetQueue(
        [FromQuery] string? status,
        [FromQuery] string? search,
        [FromQuery] string? branchId = null,
        CancellationToken ct = default)
    {
        PrescriptionStatus? statusFilter = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!EnumNames.TryParse<PrescriptionStatus>(status, out var parsed))
            {
                throw new BadRequestException($"status must be one of: {EnumNames.Names<PrescriptionStatus>()}.");
            }

            statusFilter = parsed;
        }

        var result = await _sender.Send(new GetPrescriptionsQueueQuery(statusFilter, search, branchId), ct);
        return Ok(ApiResponse<List<PrescriptionOrderDto>>.Success(result));
    }

    [HttpGet("{id:guid}")]
    [HasPermission(PharmacyPermissions.PrescriptionsRead)]
    public async Task<ActionResult<ApiResponse<PrescriptionOrderDto>>> GetById(
        [FromRoute] Guid id,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetPrescriptionDetailsQuery(id), ct);
        return Ok(ApiResponse<PrescriptionOrderDto>.Success(result));
    }

    [HttpGet("by-prescription/{prescriptionId:guid}")]
    [HasPermission(PharmacyPermissions.PrescriptionsRead)]
    public async Task<ActionResult<ApiResponse<PrescriptionOrderDto>>> GetByPrescriptionId(
        [FromRoute] Guid prescriptionId,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetPrescriptionByExternalIdQuery(prescriptionId), ct);
        return Ok(ApiResponse<PrescriptionOrderDto>.Success(result));
    }

    [HttpPost("claim")]
    [HasPermission(PharmacyPermissions.PrescriptionsClaim)]
    public async Task<ActionResult<ApiResponse<ClaimPrescriptionResultDto>>> Claim(
        [FromBody] ClaimPrescriptionApiRequest request,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new ClaimPrescriptionCommand(request.Token), ct);
        return Ok(ApiResponse<ClaimPrescriptionResultDto>.Success(result, "Prescription claimed. It will appear in the queue shortly."));
    }

    [HttpPost("{id:guid}/accept")]
    [HasPermission(PharmacyPermissions.PrescriptionsReview)]
    public async Task<ActionResult<ApiResponse<PrescriptionOrderDto>>> Accept(
        [FromRoute] Guid id,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new AcceptPrescriptionCommand(id), ct);
        return Ok(ApiResponse<PrescriptionOrderDto>.Success(result, "Prescription accepted."));
    }

    [HttpPost("{id:guid}/partial-accept")]
    [HasPermission(PharmacyPermissions.PrescriptionsReview)]
    public async Task<ActionResult<ApiResponse<PrescriptionOrderDto>>> PartiallyAccept(
        [FromRoute] Guid id,
        [FromBody] PartiallyAcceptPrescriptionApiRequest request,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(
            new PartiallyAcceptPrescriptionCommand(id, request.AcceptedItemIds ?? new List<Guid>(), request.Reason ?? string.Empty), ct);
        return Ok(ApiResponse<PrescriptionOrderDto>.Success(result, "Prescription partially accepted."));
    }

    [HttpPost("{id:guid}/reject")]
    [HasPermission(PharmacyPermissions.PrescriptionsReview)]
    public async Task<ActionResult<ApiResponse<PrescriptionOrderDto>>> Reject(
        [FromRoute] Guid id,
        [FromBody] RejectPrescriptionApiRequest request,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new RejectPrescriptionCommand(id, request.Reason ?? string.Empty), ct);
        return Ok(ApiResponse<PrescriptionOrderDto>.Success(result, "Prescription rejected."));
    }

    [HttpPost("{id:guid}/dispense")]
    [HasPermission(PharmacyPermissions.PrescriptionsDispense)]
    public async Task<ActionResult<ApiResponse<PrescriptionOrderDto>>> Dispense(
        [FromRoute] Guid id,
        [FromBody] DispensePrescriptionApiRequest request,
        CancellationToken ct = default)
    {
        var command = new DispensePrescriptionCommand(
            id,
            request.PharmacistName,
            request.PharmacistPrcLicense,
            request.ReceiptNumber,
            request.Notes,
            request.ManualBatchSelections
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PrescriptionOrderDto>.Success(result, "Prescription successfully verified and dispensed. FEFO inventory deducted."));
    }
}

public record DispensePrescriptionApiRequest
{
    public string PharmacistName { get; init; } = "Licensed Pharmacist";
    public string PharmacistPrcLicense { get; init; } = "PRC-PHARM-001";
    public string? ReceiptNumber { get; init; }
    public string? Notes { get; init; }
    public List<ManualBatchSelectionInput>? ManualBatchSelections { get; init; }
}

public record ClaimPrescriptionApiRequest
{
    public string Token { get; init; } = string.Empty;
}

public record PartiallyAcceptPrescriptionApiRequest
{
    public List<Guid>? AcceptedItemIds { get; init; }
    public string? Reason { get; init; }
}

public record RejectPrescriptionApiRequest
{
    public string? Reason { get; init; }
}
