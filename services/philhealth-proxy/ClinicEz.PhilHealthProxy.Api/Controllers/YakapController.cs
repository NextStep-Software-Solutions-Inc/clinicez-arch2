using ClinicEz.PhilHealthProxy.Application.Features.Yakap.Commands.GenerateAndSubmitReport;
using ClinicEz.PhilHealthProxy.Application.Features.Yakap.Commands.GenerateAndValidateReport;
using ClinicEz.PhilHealthProxy.Application.Features.Yakap.Queries.ExtractAndParseMasterlist;
using ClinicEz.PhilHealthProxy.Domain.Catalogs;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class YakapController(
    IMediator mediator,
    IKonsultaMasterlistParser masterlistParser)
    : ControllerBase
{
    /// <summary>
    /// Generates a Tranche 1 or Tranche 2 Yakap XML report, validates it against KonsultaData_v1.14.dtd,
    /// encrypts it per Annex D, and verifies it with PhilHealth SOAP validateReport.
    /// </summary>
    [HttpPost("reports/validate")]
    [ProducesResponseType<ApiResponse<YakapValidationResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> ValidateReport(
        [FromBody] GenerateAndValidateReportCommand command,
        CancellationToken ct)
    {
        var result = await mediator.Send(command, ct);
        return Ok(result);
    }

    /// <summary>
    /// Generates, validates, encrypts, and transmits a Yakap report transmittal to PhilHealth.
    /// </summary>
    [HttpPost("reports/submit")]
    [ProducesResponseType<ApiResponse<YakapSubmissionResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> SubmitReport(
        [FromBody] GenerateAndSubmitReportCommand command,
        CancellationToken ct)
    {
        var result = await mediator.Send(command, ct);
        return Ok(result);
    }

    /// <summary>
    /// Extracts the assigned beneficiary registration masterlist from PhilHealth, decrypts the payload,
    /// and parses the assigned members and dependents into structured objects.
    /// </summary>
    [HttpPost("masterlist/extract")]
    [ProducesResponseType<ApiResponse<YakapMasterlistResult>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> ExtractMasterlist(
        [FromBody] ExtractAndParseMasterlistQuery query,
        CancellationToken ct)
    {
        var result = await mediator.Send(query, ct);
        return Ok(result);
    }

    /// <summary>
    /// Validates whether a PhilHealth Identification Number (PIN) has valid format and Modulus-11 check digit.
    /// </summary>
    [HttpGet("pin/{pin}/validate")]
    [ProducesResponseType<ApiResponse<bool>>(StatusCodes.Status200OK)]
    public IActionResult ValidatePin(string pin)
    {
        bool isValid = masterlistParser.ValidatePin(pin);
        return Ok(ApiResponse<bool>.Success(isValid));
    }

    // ── Catalogs & Data Dictionaries ─────────────────────────────────────────

    [HttpGet("catalogs/diseases")]
    [ProducesResponseType<ApiResponse<IReadOnlyList<CatalogItem>>>(StatusCodes.Status200OK)]
    public IActionResult GetDiseasesCatalog() =>
        Ok(ApiResponse<IReadOnlyList<CatalogItem>>.Success(PhilHealthCatalogs.MedicalDiseases));

    [HttpGet("catalogs/symptoms")]
    [ProducesResponseType<ApiResponse<IReadOnlyList<CatalogItem>>>(StatusCodes.Status200OK)]
    public IActionResult GetSymptomsCatalog() =>
        Ok(ApiResponse<IReadOnlyList<CatalogItem>>.Success(PhilHealthCatalogs.SignsAndSymptoms));

    [HttpGet("catalogs/diagnostics")]
    [ProducesResponseType<ApiResponse<IReadOnlyList<CatalogItem>>>(StatusCodes.Status200OK)]
    public IActionResult GetDiagnosticsCatalog() =>
        Ok(ApiResponse<IReadOnlyList<CatalogItem>>.Success(PhilHealthCatalogs.DiagnosticServices));

    [HttpGet("catalogs/management")]
    [ProducesResponseType<ApiResponse<IReadOnlyList<CatalogItem>>>(StatusCodes.Status200OK)]
    public IActionResult GetManagementCatalog() =>
        Ok(ApiResponse<IReadOnlyList<CatalogItem>>.Success(PhilHealthCatalogs.ManagementActions));

    [HttpGet("catalogs/gamot")]
    [ProducesResponseType<ApiResponse<IReadOnlyList<CatalogItem>>>(StatusCodes.Status200OK)]
    public IActionResult GetGamotCatalog() =>
        Ok(ApiResponse<IReadOnlyList<CatalogItem>>.Success(PhilHealthCatalogs.GamotFormulary));
}
