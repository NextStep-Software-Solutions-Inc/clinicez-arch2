using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Shared.Search;

/// <summary>
/// Universal contract for pluggable domain search providers across ClinicEZ services.
/// Any domain feature registers search capabilities simply by implementing this interface.
/// </summary>
public interface ISearchProvider
{
    /// <summary>
    /// Unique category identifier (e.g., "Patients", "Consultations", "Appointments", "Settings", "Queue", "Billing", "LabOrders").
    /// Used by workstations for category tabs and query routing.
    /// </summary>
    string Category { get; }

    /// <summary>
    /// Display priority in the search palette (lower numbers render first; e.g., Patients = 10, Consultations = 20).
    /// </summary>
    int Priority { get; }

    /// <summary>
    /// Staff permission required to execute this provider and view results.
    /// Set to null or empty if available to all authenticated clinic personnel.
    /// </summary>
    string? RequiredPermission { get; }

    /// <summary>
    /// Asynchronously searches domain records isolated to the specified tenant.
    /// </summary>
    /// <param name="query">The raw or normalized search term entered by the user.</param>
    /// <param name="tenantId">The clinic or tenant identifier enforcing multi-tenant isolation.</param>
    /// <param name="limit">The maximum number of items to return from this provider.</param>
    /// <param name="ct">Cancellation token for timeout and request abortion propagation.</param>
    /// <returns>A read-only collection of search result items.</returns>
    Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query,
        Guid tenantId,
        int limit,
        CancellationToken ct);

    /// <summary>
    /// Convenience overload accepting a strongly-typed <see cref="SearchQuery"/> object.
    /// </summary>
    Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        SearchQuery query,
        CancellationToken ct = default) =>
        SearchAsync(
            query?.Query ?? string.Empty,
            query?.TenantId ?? Guid.Empty,
            query?.Limit ?? SearchQuery.DefaultLimit,
            ct);
}
