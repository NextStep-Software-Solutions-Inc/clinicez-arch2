using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.DTOs;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Workspace;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/settings")]
[Route("api/v1/clinic/settings")]
public sealed class SettingsController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IClinicDocumentPdfService? _pdfService;
    private readonly IRepository<FacilitySettings>? _settingsRepo;
    private readonly ISampleDocumentGenerator? _sampleDocGenerator;

    public SettingsController(
        ISender sender,
        IClinicDocumentPdfService? pdfService = null,
        IRepository<FacilitySettings>? settingsRepo = null,
        ISampleDocumentGenerator? sampleDocGenerator = null)
    {
        _sender = sender;
        _pdfService = pdfService;
        _settingsRepo = settingsRepo;
        _sampleDocGenerator = sampleDocGenerator;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.SettingsRead)]
    public async Task<ActionResult<ApiResponse<ClinicSettingsDto>>> GetSettings(CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicSettingsQuery(), ct);
        return Ok(ApiResponse<ClinicSettingsDto>.Success(result));
    }

    [HttpGet("reception-placard-pdf")]
    [HasPermission(ClinicPermissions.SettingsRead)]
    public async Task<IActionResult> DownloadReceptionPlacardPdf(
        [FromQuery] string? qrUrl = null,
        [FromQuery] string? joinCode = null,
        [FromQuery] string? expiresAt = null,
        CancellationToken ct = default)
    {
        if (_pdfService == null)
        {
            return StatusCode(503, "PDF service is unavailable.");
        }

        var settings = _settingsRepo != null
            ? await _settingsRepo.Query().FirstOrDefaultAsync(ct)
            : null;

        settings ??= new FacilitySettings
        {
            TenantId = "default",
            ClinicName = "Clinic EZ Partner Medical Clinic"
        };

        var pdfBytes = _pdfService.GenerateReceptionPlacardPdf(settings, qrUrl ?? string.Empty, joinCode, expiresAt);
        return File(pdfBytes, "application/pdf", "ReceptionPlacard.pdf");
    }

    [HttpGet("sample-document-pdf")]
    [HasPermission(ClinicPermissions.SettingsRead)]
    public async Task<IActionResult> DownloadSampleDocumentPdf(
        [FromQuery] string docType = "Medical Certificate",
        [FromQuery] bool wet = false,
        [FromQuery] string? paperSize = null,
        CancellationToken ct = default)
    {
        if (_sampleDocGenerator == null)
        {
            return StatusCode(503, "Sample document generator is unavailable.");
        }

        var settings = _settingsRepo != null
            ? await _settingsRepo.Query().FirstOrDefaultAsync(ct)
            : null;

        settings ??= new FacilitySettings
        {
            TenantId = "default",
            ClinicName = "Clinic EZ Partner Medical Clinic",
            LetterheadHeader = "CLINIC EZ HEALTHCARE CENTER",
            LetterheadAddress = "124 Rizal Avenue, San Pedro, Laguna",
            LetterheadContact = "Tel: (02) 8876-5432 • Mobile: +63 917 123 4567"
        };

        var (pdfBytes, fileName) = _sampleDocGenerator.GenerateSamplePdf(docType, wet, paperSize, settings);
        return File(pdfBytes, "application/pdf", fileName);
    }

    /// <summary>
    /// Workspace brand (display name, logo, accent) and regional defaults inherited from the tenant's workspace.
    /// Any signed-in staff member may read it - the console uses it to theme itself.
    /// </summary>
    [HttpGet("workspace-profile")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<WorkspaceProfile>>> GetWorkspaceProfile(CancellationToken ct)
    {
        var profile = await _sender.Send(new GetWorkspaceProfileQuery(), ct);
        return profile is null
            ? NotFound(ApiResponse<WorkspaceProfile>.Fail("Workspace profile is not available yet."))
            : Ok(ApiResponse<WorkspaceProfile>.Success(profile));
    }

    [HttpPut]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicSettingsDto>>> UpdateSettings(
        [FromBody] UpdateClinicSettingsCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicSettingsDto>.Success(result, "Clinic preferences updated successfully."));
    }

    [HttpPost("philhealth/override")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicSettingsDto>>> OverridePhilHealth(
        [FromBody] OverridePhilHealthSettingsCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicSettingsDto>.Success(result, "Clinic PhilHealth credentials overridden successfully."));
    }

    [HttpPost("philhealth/revert")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicSettingsDto>>> RevertPhilHealthToBranch(CancellationToken ct)
    {
        var result = await _sender.Send(new RevertPhilHealthToBranchCommand(), ct);
        return Ok(ApiResponse<ClinicSettingsDto>.Success(result, "Clinic PhilHealth settings reverted to branch baseline."));
    }
}
