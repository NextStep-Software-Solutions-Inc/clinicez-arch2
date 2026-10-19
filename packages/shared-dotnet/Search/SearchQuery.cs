using System;

namespace ClinicEz.Shared.Search;

/// <summary>
/// Encapsulates normalized search request parameters across microservices and query handlers.
/// </summary>
public sealed record SearchQuery
{
    public const int DefaultLimit = 20;
    public const int MaxLimit = 100;

    public string Query { get; init; }
    public string? Category { get; init; }
    public int Limit { get; init; }
    public Guid? TenantId { get; init; }

    public SearchQuery(
        string query,
        string? category = null,
        int limit = DefaultLimit,
        Guid? tenantId = null)
    {
        Query = query ?? string.Empty;
        Category = string.IsNullOrWhiteSpace(category) ? null : category.Trim();
        Limit = limit <= 0 ? DefaultLimit : Math.Min(limit, MaxLimit);
        TenantId = tenantId;
    }

    /// <summary>
    /// Returns the search query with leading and trailing whitespace removed.
    /// </summary>
    public string NormalizedQuery => Query.Trim();

    /// <summary>
    /// Returns true if the query is null, empty, or consists only of white-space characters.
    /// </summary>
    public bool IsEmpty => string.IsNullOrWhiteSpace(Query);
}
