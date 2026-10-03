using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Prescriptions.Commands;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/prescriptions")]
public sealed class PrescriptionsController : ControllerBase
{
    private readonly ISender _sender;

    public PrescriptionsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet("{consultationId:guid}/slip")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<PrescriptionSlipDto>>> GetSlipByConsultationId(
        [FromRoute] Guid consultationId,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetPrescriptionSlipQuery(ConsultationId: consultationId), ct);
        return Ok(ApiResponse<PrescriptionSlipDto>.Success(result));
    }

    [HttpGet("by-number/{prescriptionNumber}/slip")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<PrescriptionSlipDto>>> GetSlipByPrescriptionNumber(
        [FromRoute] string prescriptionNumber,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetPrescriptionSlipQuery(PrescriptionNumber: prescriptionNumber), ct);
        return Ok(ApiResponse<PrescriptionSlipDto>.Success(result));
    }

    [HttpPost("{consultationId:guid}/record-external-dispense")]
    [HasPermission(ClinicPermissions.ConsultationsWrite)]
    public async Task<ActionResult<ApiResponse<PrescriptionSlipDto>>> RecordExternalDispense(
        [FromRoute] Guid consultationId,
        [FromBody] RecordExternalDispenseRequest request,
        CancellationToken ct = default)
    {
        var command = new RecordExternalDispenseCommand(
            consultationId,
            request.ExternalPharmacyName,
            request.ExternalBranchLocation,
            request.PharmacistName,
            request.PharmacistPrcLicense,
            request.OfficialReceiptNumber,
            request.ReceiptDocumentUrl,
            request.Notes
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PrescriptionSlipDto>.Success(result, "External pharmacy dispensing proof recorded successfully."));
    }

    [HttpPost("evaluate-cds")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<EvaluateCdsResponse>>> EvaluateClinicalDecisionSupport(
        [FromBody] EvaluateCdsRequest request,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new EvaluateClinicalDecisionSupportQuery(request), ct);
        return Ok(ApiResponse<EvaluateCdsResponse>.Success(result));
    }
}

public record RecordExternalDispenseRequest
{
    public required string ExternalPharmacyName { get; init; } // e.g. "Mercury Drug", "Watsons", "Rose Pharmacy"
    public string? ExternalBranchLocation { get; init; }
    public string? PharmacistName { get; init; }
    public string? PharmacistPrcLicense { get; init; }
    public string? OfficialReceiptNumber { get; init; }
    public string? ReceiptDocumentUrl { get; init; }
    public string? Notes { get; init; }
}
