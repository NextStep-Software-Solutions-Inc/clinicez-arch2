using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Shared.Search;

/// <summary>
/// Extension methods for <see cref="ISearchProvider"/> enabling uniform method invocation
/// across both interface references and concrete provider implementations.
/// </summary>
public static class SearchProviderExtensions
{
    /// <summary>
    /// Asynchronously searches domain records using a strongly-typed <see cref="SearchQuery"/> object.
    /// Provides uniform syntax across concrete class references (which do not inherit Default Interface Methods)
    /// and interface references, mapping null-safe query properties to the primary provider contract.
    /// </summary>
    /// <param name="provider">The search provider instance.</param>
    /// <param name="query">The search query containing term, category, limit, and tenant.</param>
    /// <param name="ct">Cancellation token for timeout and request abortion propagation.</param>
    /// <returns>A read-only collection of search result items.</returns>
    public static Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        this ISearchProvider provider,
        SearchQuery query,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(provider);

        return provider.SearchAsync(
            query?.Query ?? string.Empty,
            query?.TenantId ?? Guid.Empty,
            query?.Limit ?? SearchQuery.DefaultLimit,
            ct);
    }
}
