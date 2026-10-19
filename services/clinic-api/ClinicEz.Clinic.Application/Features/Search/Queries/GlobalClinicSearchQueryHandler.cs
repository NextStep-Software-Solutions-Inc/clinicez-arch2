using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Search;
using MediatR;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.Search.Queries;

/// <summary>
/// Orchestrates parallel search execution across all discovered, active pluggable search providers.
/// Enforces multi-tenant isolation, RBAC permission gating, per-provider fault tolerance,
/// 500ms timeout budget, and priority-based result aggregation.
/// </summary>
public sealed class GlobalClinicSearchQueryHandler : IRequestHandler<GlobalClinicSearchQuery, SearchResponseDto>
{
    private static readonly Guid UnauthenticatedClinicId = new("00000000-0000-0000-0000-00000000dead");

    private readonly IEnumerable<ISearchProvider> _providers;
    private readonly IClinicContext _clinicContext;
    private readonly ILogger<GlobalClinicSearchQueryHandler> _logger;

    public GlobalClinicSearchQueryHandler(
        IEnumerable<ISearchProvider> providers,
        IClinicContext clinicContext,
        ILogger<GlobalClinicSearchQueryHandler> logger)
    {
        _providers = providers ?? throw new ArgumentNullException(nameof(providers));
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<SearchResponseDto> Handle(GlobalClinicSearchQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        cancellationToken.ThrowIfCancellationRequested();

        // 1. Early exit on null or whitespace query
        if (string.IsNullOrWhiteSpace(request.Query))
        {
            return SearchResponseDto.Empty;
        }

        var queryTerm = request.Query.Trim();
        var effectiveLimit = request.Limit <= 0
            ? SearchQuery.DefaultLimit
            : Math.Min(request.Limit, SearchQuery.MaxLimit);

        // 2. Enforce clinic tenant isolation
        var clinicId = _clinicContext.ClinicId;
        if (clinicId == Guid.Empty || clinicId == UnauthenticatedClinicId)
        {
            _logger.LogWarning(
                "Global clinic search rejected: unauthenticated or invalid clinic context '{ClinicId}'.",
                clinicId);
            return SearchResponseDto.Empty;
        }

        // 3. Filter providers by category and RBAC permissions
        var targetCategory = request.Category?.Trim();
        var activeProviders = _providers.Where(p =>
        {
            // Category filtering
            if (!string.IsNullOrWhiteSpace(targetCategory) &&
                !string.Equals(p.Category, targetCategory, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            // RBAC permission check
            if (!string.IsNullOrWhiteSpace(p.RequiredPermission) &&
                !_clinicContext.HasPermission(p.RequiredPermission))
            {
                _logger.LogDebug(
                    "Skipping search provider '{Category}' - current user lacks required permission '{Permission}'.",
                    p.Category,
                    p.RequiredPermission);
                return false;
            }

            return true;
        }).ToList();

        if (activeProviders.Count == 0)
        {
            return SearchResponseDto.Empty;
        }

        // 4. Setup 500ms linked timeout token source
        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);
        var searchCt = linkedCts.Token;

        // 5. Execute active providers concurrently via Task.WhenAll with individual fault tolerance
        var searchTasks = activeProviders.Select(async provider =>
        {
            try
            {
                var items = await provider.SearchAsync(queryTerm, clinicId, effectiveLimit, searchCt);
                return (Priority: provider.Priority, Items: items ?? Array.Empty<SearchResultItemDto>());
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // Propagate client/request cancellation
                throw;
            }
            catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
            {
                _logger.LogWarning(
                    "Search provider '{Category}' timed out after 500ms for query '{Query}' in clinic '{ClinicId}'. Skipping provider results.",
                    provider.Category,
                    queryTerm,
                    clinicId);
                return (Priority: provider.Priority, Items: (IReadOnlyList<SearchResultItemDto>)Array.Empty<SearchResultItemDto>());
            }
            catch (Exception ex)
            {
                // Fault tolerance: isolated failure does not crash overall search
                _logger.LogError(
                    ex,
                    "Search provider '{Category}' encountered an error searching for query '{Query}' in clinic '{ClinicId}'. Skipping provider results.",
                    provider.Category,
                    queryTerm,
                    clinicId);
                return (Priority: provider.Priority, Items: (IReadOnlyList<SearchResultItemDto>)Array.Empty<SearchResultItemDto>());
            }
        });

        var providerResults = await Task.WhenAll(searchTasks);

        // 6. Aggregate and sort results by provider Priority (lower values first)
        var aggregatedItems = providerResults
            .OrderBy(r => r.Priority)
            .SelectMany(r => r.Items)
            .ToList();

        return new SearchResponseDto(aggregatedItems, aggregatedItems.Count);
    }
}
