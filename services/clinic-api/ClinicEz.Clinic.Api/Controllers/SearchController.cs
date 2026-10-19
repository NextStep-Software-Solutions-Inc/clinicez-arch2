using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Search.Queries;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Search;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

/// <summary>
/// Universal pluggable search API endpoint for clinic workstations and external clients.
/// Dispatches queries to <see cref="GlobalClinicSearchQueryHandler"/> which fans out across all registered domain providers.
/// </summary>
[ApiController]
[Route("api/v1/search")]
[Produces("application/json")]
public sealed class SearchController : ControllerBase
{
    private readonly ISender _sender;

    public SearchController(ISender sender)
    {
        _sender = sender;
    }

    /// <summary>
    /// Executes a workspace-wide search across all pluggable domain categories (e.g. Patients, Consultations, Appointments, Settings, Queue, Billing, LabOrders).
    /// </summary>
    /// <param name="q">The search query term entered by the user.</param>
    /// <param name="category">Optional category filter (e.g. "Patients", "Consultations", "Appointments", "Settings", "Queue", "Billing", "LabOrders").</param>
    /// <param name="limit">Maximum number of results to retrieve per category (default: 20, max: 100).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Standard ApiResponse containing SearchResponseDto with matching items.</returns>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<SearchResponseDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<SearchResponseDto>>> Search(
        [FromQuery] string? q,
        [FromQuery] string? category,
        [FromQuery] int limit = SearchQuery.DefaultLimit,
        CancellationToken ct = default)
    {
        // Early exit: immediately return empty results if query is empty or whitespace
        if (string.IsNullOrWhiteSpace(q))
        {
            return Ok(ApiResponse<SearchResponseDto>.Success(SearchResponseDto.Empty));
        }

        var result = await _sender.Send(new GlobalClinicSearchQuery(q, category, limit), ct);
        return Ok(ApiResponse<SearchResponseDto>.Success(result));
    }
}
