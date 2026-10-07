using System.Text.Json;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

/// <summary>
/// The PhilHealth Catalog: the official Konsulta / YAKAP <c>lib_*</c> libraries (ICD-10, medicines, examinations, ...).
/// Reading requires a signed-in user; importing a newer kit or a corrected library requires <c>philhealth.catalog.import</c>.
/// </summary>
[ApiController]
[Route("api/v1/philhealth/catalog")]
public sealed class PhilHealthCatalogController : ControllerBase
{
    private const long MaxUploadBytes = 20 * 1024 * 1024;

    private readonly IPhilHealthCatalogQueryService _query;
    private readonly IPhilHealthCatalogImportService _import;

    public PhilHealthCatalogController(IPhilHealthCatalogQueryService query, IPhilHealthCatalogImportService import)
    {
        _query = query;
        _import = import;
    }

    /// <summary>Loaded libraries with their kit version and content hash (clients use it to refresh their offline copy).</summary>
    [HttpGet("versions")]
    public async Task<IActionResult> Versions(CancellationToken ct) =>
        Ok(ApiResponse<IReadOnlyList<PhilHealthCatalogLibrarySummary>>.Success(await _query.GetLibrariesAsync(ct)));

    /// <summary>Rows of one library. <paramref name="q"/> searches code and description.</summary>
    [HttpGet("{library}")]
    public async Task<IActionResult> Items(
        string library,
        [FromQuery] string? q,
        [FromQuery] bool activeOnly = true,
        [FromQuery] int skip = 0,
        [FromQuery] int take = 200,
        CancellationToken ct = default)
    {
        var page = await _query.GetItemsAsync(library, q, activeOnly, skip, take, ct);
        return page is null
            ? NotFound(ApiResponse<object>.Fail($"Library '{library}' was not found."))
            : Ok(ApiResponse<PhilHealthCatalogPage>.Success(page));
    }

    /// <summary>Recent imports (boot seeding and uploads).</summary>
    [HttpGet("import/status")]
    [HasPermission(ClinicPermissions.PhilHealthCatalogImport)]
    public async Task<IActionResult> ImportStatus([FromQuery] int take = 50, CancellationToken ct = default) =>
        Ok(ApiResponse<IReadOnlyList<PhilHealthCatalogImportLogDto>>.Success(await _query.GetImportLogsAsync(take, ct)));

    /// <summary>
    /// Imports one library from an official <c>lib_*.xlsx</c> (library taken from the file name, <paramref name="kitVersion"/>
    /// required) or from the uniform JSON. Idempotent: re-importing the same file changes nothing. Use <paramref name="dryRun"/>
    /// to preview.
    /// </summary>
    [HttpPost("import")]
    [HasPermission(ClinicPermissions.PhilHealthCatalogImport)]
    [RequestSizeLimit(MaxUploadBytes)]
    public async Task<IActionResult> Import(
        IFormFile file,
        [FromForm] string? kitVersion,
        [FromForm] string? library,
        [FromForm] bool dryRun = false,
        CancellationToken ct = default)
    {
        if (file is null || file.Length == 0) return BadRequest(ApiResponse<object>.Fail("Choose a file to import."));
        if (file.Length > MaxUploadBytes) return StatusCode(StatusCodes.Status413PayloadTooLarge, ApiResponse<object>.Fail("The file is too large."));

        try
        {
            await using var stream = file.OpenReadStream();
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();

            PhilHealthCatalogFile catalog;
            if (extension == ".json")
            {
                catalog = PhilHealthCatalogEmbeddedSeed.Parse(stream);
            }
            else if (extension == ".xlsx")
            {
                var name = string.IsNullOrWhiteSpace(library)
                    ? PhilHealthCatalogXlsxReader.LibraryFromFileName(file.FileName)
                    : library.Trim().ToLowerInvariant();
                if (name is null)
                    return BadRequest(ApiResponse<object>.Fail("Name the file like the official library (for example lib_icd.xlsx) or pass the library."));
                if (string.IsNullOrWhiteSpace(kitVersion))
                    return BadRequest(ApiResponse<object>.Fail("Enter the kit version this file belongs to (for example 1.1)."));

                try
                {
                    catalog = PhilHealthCatalogXlsxReader.Read(stream, name, kitVersion.Trim());
                }
                catch (Exception ex) when (ex is InvalidDataException or IOException or NullReferenceException or ArgumentException or FormatException)
                {
                    return BadRequest(ApiResponse<object>.Fail("The file is not a readable Excel workbook."));
                }
            }
            else
            {
                return BadRequest(ApiResponse<object>.Fail("Only .xlsx (official library) or .json files can be imported."));
            }

            var actor = User.FindFirst("name")?.Value ?? User.Identity?.Name ?? "admin";
            var result = await _import.ImportAsync(catalog, PhilHealthCatalogImportSource.Upload, actor, dryRun, ct);

            return result.Status == PhilHealthCatalogImportStatus.Rejected
                ? Conflict(ApiResponse<PhilHealthCatalogImportResult>.Fail(result.Message ?? "Import rejected."))
                : Ok(ApiResponse<PhilHealthCatalogImportResult>.Success(result, result.Message ?? "Import complete."));
        }
        catch (PhilHealthCatalogValidationException ex)
        {
            return BadRequest(ApiResponse<object>.Fail(ex.Message));
        }
        catch (PhilHealthCatalogBusyException ex)
        {
            return Conflict(ApiResponse<object>.Fail(ex.Message));
        }
        catch (JsonException ex)
        {
            return BadRequest(ApiResponse<object>.Fail($"The JSON file could not be read: {ex.Message}"));
        }
    }
}
