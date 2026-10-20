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

using System.Linq;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Documents.Configuration;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/prescriptions")]
public sealed class PrescriptionsController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IClinicDocumentPdfService _pdfService;
    private readonly IRepository<ClinicSettings> _settingsRepo;

    public PrescriptionsController(
        ISender sender,
        IClinicDocumentPdfService pdfService,
        IRepository<ClinicSettings> settingsRepo)
    {
        _sender = sender;
        _pdfService = pdfService;
        _settingsRepo = settingsRepo;
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

    [HttpGet("{consultationId:guid}/slip-pdf")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<IActionResult> DownloadPrescriptionPdfByConsultationId(
        [FromRoute] Guid consultationId,
        [FromQuery] bool? wet = null,
        CancellationToken ct = default)
    {
        var slip = await _sender.Send(new GetPrescriptionSlipQuery(ConsultationId: consultationId), ct);
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct) ?? new ClinicSettings
        {
            TenantId = "default",
            ClinicId = Guid.Empty,
            ClinicName = slip.ClinicName
        };

        var isDangerous = slip.Items.Any(i => i.IsDangerousDrug);
        var signatureMode = isDangerous || wet == true
            ? SignatureMode.WetSignature
            : (wet == false ? SignatureMode.ESignatureSpecimen : SignatureMode.ESignatureSpecimen);

        var pdfBytes = _pdfService.GeneratePrescriptionPdf(slip, settings, doctor: null, signatureMode: signatureMode);
        return File(pdfBytes, "application/pdf", $"Prescription-{slip.PrescriptionNumber}.pdf");
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

    [HttpGet("by-number/{prescriptionNumber}/slip-pdf")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<IActionResult> DownloadPrescriptionPdfByNumber(
        [FromRoute] string prescriptionNumber,
        [FromQuery] bool? wet = null,
        CancellationToken ct = default)
    {
        var slip = await _sender.Send(new GetPrescriptionSlipQuery(PrescriptionNumber: prescriptionNumber), ct);
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct) ?? new ClinicSettings
        {
            TenantId = "default",
            ClinicId = Guid.Empty,
            ClinicName = slip.ClinicName
        };

        var isDangerous = slip.Items.Any(i => i.IsDangerousDrug);
        var signatureMode = isDangerous || wet == true
            ? SignatureMode.WetSignature
            : (wet == false ? SignatureMode.ESignatureSpecimen : SignatureMode.ESignatureSpecimen);

        var pdfBytes = _pdfService.GeneratePrescriptionPdf(slip, settings, doctor: null, signatureMode: signatureMode);
        return File(pdfBytes, "application/pdf", $"Prescription-{slip.PrescriptionNumber}.pdf");
    }

    /// <summary>Drugstores this clinic has recorded external dispenses with (most used first).</summary>
    [HttpGet("external-pharmacies")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<string>>>> GetRecentExternalPharmacies(
        [FromQuery] int take = 12,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetRecentExternalPharmaciesQuery(take), ct);
        return Ok(ApiResponse<IReadOnlyList<string>>.Success(result));
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
