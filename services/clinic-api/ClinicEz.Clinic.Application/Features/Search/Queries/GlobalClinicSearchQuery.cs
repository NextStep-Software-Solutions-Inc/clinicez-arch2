using ClinicEz.Shared.Search;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Search.Queries;

/// <summary>
/// MediatR query to orchestrate a workspace-wide search across all pluggable domain search providers.
/// </summary>
/// <param name="Query">The search query term entered by the user.</param>
/// <param name="Category">Optional category filter (e.g. "Patients", "Consultations", "Appointments", "Settings", "Queue", "Billing", "LabOrders"). If null, searches across all active permitted categories.</param>
/// <param name="Limit">The maximum number of matches to retrieve per category (default: 20, max: 100).</param>
public sealed record GlobalClinicSearchQuery(
    string? Query,
    string? Category = null,
    int Limit = SearchQuery.DefaultLimit
) : IRequest<SearchResponseDto>;
