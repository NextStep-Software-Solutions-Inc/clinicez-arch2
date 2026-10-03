using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Gamot.Commands;
using ClinicEz.Pharmacy.Application.Features.Gamot.DTOs;
using ClinicEz.Pharmacy.Application.Features.Gamot.Queries;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.DTOs;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Pharmacy.Api.Controllers;

[ApiController]
[Route("api/v1/gamot")]
public sealed class GamotController : ControllerBase
{
    private readonly ISender _sender;

    public GamotController(ISender sender)
    {
        _sender = sender;
    }

    /// <summary>
    /// Retrieves the PhilHealth GAMOT beneficiary ledger, balance, and transaction history by PhilHealth PIN.
    /// Default allocation is PHP 9,000.00 per benefit year per PhilHealth Circular No. 2025-0013.
    /// </summary>
    [HttpGet("ledger/{pin}")]
    public async Task<ActionResult<ApiResponse<GamotBeneficiaryLedgerDto>>> GetLedgerByPin(
        [FromRoute] string pin,
        [FromQuery] string? year,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetGamotLedgerByPinQuery(pin, year), ct);
        return Ok(result);
    }

    /// <summary>
    /// Searches and retrieves medications from the PhilHealth GAMOT formulary catalog.
    /// </summary>
    [HttpGet("formulary")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<GamotFormularyDto>>>> GetFormulary(
        [FromQuery] string? search,
        [FromQuery] string? category,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetGamotFormularyQuery(search, category), ct);
        return Ok(result);
    }

    /// <summary>
    /// Generates a PhilHealth Unique Prescription Security Code (UPSC) for a prescription item.
    /// </summary>
    [HttpPost("upsc/generate")]
    public async Task<ActionResult<ApiResponse<UpscGenerateResultDto>>> GenerateUpsc(
        [FromBody] GenerateUpscApiRequest request,
        CancellationToken ct = default)
    {
        var command = new GenerateUpscCommand(
            request.PrescriptionOrderId,
            request.PrescriptionOrderItemId,
            request.HciAccreditationNumber);

        var result = await _sender.Send(command, ct);
        return Ok(result);
    }

    /// <summary>
    /// Verifies the authenticity, checksum, and one-time use status of a PhilHealth UPSC.
    /// </summary>
    [HttpPost("upsc/validate")]
    public async Task<ActionResult<ApiResponse<UpscVerifyResultDto>>> ValidateUpsc(
        [FromBody] ValidateUpscApiRequest request,
        CancellationToken ct = default)
    {
        var query = new ValidateUpscQuery(
            request.UniquePrescriptionSecurityCode,
            request.HciAccreditationNumber,
            request.PhilHealthIdentificationNumber,
            request.PrescriptionNumber,
            request.DoctorPrcLicense,
            request.DrugCode,
            request.Quantity,
            request.IssueDate);

        var result = await _sender.Send(query, ct);
        return Ok(result);
    }

    /// <summary>
    /// Dispenses a PhilHealth GAMOT covered prescription order with FEFO inventory deduction and ledger debit.
    /// </summary>
    [HttpPost("dispense")]
    public async Task<ActionResult<ApiResponse<PrescriptionOrderDto>>> DispenseGamot(
        [FromBody] DispenseGamotApiRequest request,
        CancellationToken ct = default)
    {
        var command = new DispenseGamotPrescriptionCommand(
            request.PrescriptionOrderId,
            request.PharmacistName,
            request.PharmacistPrcLicense,
            request.HciAccreditationNumber,
            request.ReceiptNumber,
            request.Notes,
            request.ManualBatchSelections);

        var result = await _sender.Send(command, ct);
        return Ok(result);
    }

    /// <summary>
    /// Reverses a PhilHealth GAMOT transaction and restores the beneficiary's benefit balance.
    /// </summary>
    [HttpPost("transactions/{id:guid}/reverse")]
    public async Task<ActionResult<ApiResponse<GamotLedgerTransactionDto>>> ReverseTransaction(
        [FromRoute] Guid id,
        [FromBody] ReverseGamotTransactionApiRequest request,
        CancellationToken ct = default)
    {
        var command = new ReverseGamotTransactionCommand(
            id,
            request.Reason,
            request.ReversedBy);

        var result = await _sender.Send(command, ct);
        return Ok(result);
    }
}

public sealed record GenerateUpscApiRequest(
    Guid PrescriptionOrderId,
    Guid PrescriptionOrderItemId,
    string HciAccreditationNumber);

public sealed record ValidateUpscApiRequest(
    string UniquePrescriptionSecurityCode,
    string? HciAccreditationNumber = null,
    string? PhilHealthIdentificationNumber = null,
    string? PrescriptionNumber = null,
    string? DoctorPrcLicense = null,
    string? DrugCode = null,
    int? Quantity = null,
    DateTime? IssueDate = null);

public sealed record DispenseGamotApiRequest(
    Guid PrescriptionOrderId,
    string PharmacistName,
    string PharmacistPrcLicense,
    string HciAccreditationNumber,
    string? ReceiptNumber = null,
    string? Notes = null,
    List<ManualBatchSelectionInput>? ManualBatchSelections = null);

public sealed record ReverseGamotTransactionApiRequest(
    string Reason,
    string ReversedBy);
