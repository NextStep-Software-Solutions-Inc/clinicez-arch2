using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Prescriptions.Commands;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.Queries;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/public/rx-upload")]
[Route("api/v1/public/rx-verify")]
[AllowAnonymous]
public sealed class PublicRxVerificationController : ControllerBase
{
    private readonly ISender _sender;

    public PublicRxVerificationController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet("{token}")]
    [HttpGet("{token}/info")]
    public async Task<ActionResult<ApiResponse<PublicRxVerificationInfoDto>>> VerifyPrescription(
        [FromRoute] string token,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetPublicRxVerificationInfoQuery(token), ct);
        return Ok(ApiResponse<PublicRxVerificationInfoDto>.Success(result));
    }

    [HttpPost("{token}")]
    [HttpPost("{token}/dispense")]
    public async Task<ActionResult<ApiResponse<PublicRxVerificationInfoDto>>> SubmitExternalDispense(
        [FromRoute] string token,
        [FromBody] SubmitPublicRxDispenseRequest request,
        CancellationToken ct = default)
    {
        var command = new SubmitPublicRxDispenseCommand(
            token,
            request.ExternalPharmacyName,
            request.ExternalBranchLocation,
            request.PharmacistName,
            request.PharmacistPrcLicense,
            request.OfficialReceiptNumber,
            request.ReceiptDocumentUrl,
            request.Notes
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PublicRxVerificationInfoDto>.Success(result, "Prescription successfully verified and dispensed by external pharmacy."));
    }

    [HttpPost("{token}/multipart")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<ApiResponse<PublicRxVerificationInfoDto>>> SubmitExternalDispenseMultipart(
        [FromRoute] string token,
        [FromForm] string externalPharmacyName,
        [FromForm] string? externalBranchLocation,
        [FromForm] string? pharmacistName,
        [FromForm] string? pharmacistPrcLicense,
        [FromForm] string? officialReceiptNumber,
        [FromForm] string? notes,
        [FromForm] Microsoft.AspNetCore.Http.IFormFile? file,
        CancellationToken ct = default)
    {
        string? receiptBase64 = null;
        if (file != null && file.Length > 0)
        {
            using var ms = new System.IO.MemoryStream();
            await file.CopyToAsync(ms, ct);
            var mime = string.IsNullOrEmpty(file.ContentType) ? "application/pdf" : file.ContentType;
            receiptBase64 = $"data:{mime};base64,{Convert.ToBase64String(ms.ToArray())}";
        }

        var command = new SubmitPublicRxDispenseCommand(
            token,
            externalPharmacyName ?? "External Pharmacy",
            externalBranchLocation,
            pharmacistName,
            pharmacistPrcLicense,
            officialReceiptNumber,
            receiptBase64,
            notes
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PublicRxVerificationInfoDto>.Success(result, "Prescription successfully verified and dispensed by external pharmacy."));
    }
}

public record SubmitPublicRxDispenseRequest
{
    public required string ExternalPharmacyName { get; init; } // e.g. "Mercury Drug", "Watsons", "Rose Pharmacy"
    public string? ExternalBranchLocation { get; init; }
    public string? PharmacistName { get; init; }
    public string? PharmacistPrcLicense { get; init; }
    public string? OfficialReceiptNumber { get; init; }
    public string? ReceiptDocumentUrl { get; init; }
    public string? Notes { get; init; }
}
