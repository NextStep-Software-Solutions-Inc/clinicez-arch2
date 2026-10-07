using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Api.Authorization;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.DTOs;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Queries;
using ClinicEz.Pharmacy.Domain.Constants;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Shared.Common;
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
        [FromQuery] PrescriptionStatus? status,
        [FromQuery] string? search,
        [FromQuery] string? branchId = null,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetPrescriptionsQueueQuery(status, search, branchId), ct);
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
