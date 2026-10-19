using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Search;

/// <summary>
/// Standard badge variant string constants aligned with @clinicez/design-tokens semantic tokens.
/// </summary>
public static class SearchBadgeVariant
{
    public const string Routine = "routine";
    public const string Urgent = "urgent";
    public const string Emergency = "emergency";
    public const string Neutral = "neutral";

    public static bool IsValid(string? variant) =>
        variant is Routine or Urgent or Emergency or Neutral;

    public static string Normalize(string? variant)
    {
        if (string.IsNullOrWhiteSpace(variant)) return Neutral;
        var lower = variant.Trim().ToLowerInvariant();
        return lower switch
        {
            Routine => Routine,
            Urgent => Urgent,
            Emergency => Emergency,
            _ => Neutral
        };
    }
}

/// <summary>
/// Canonical badge variant accessor supporting pluralized naming convention.
/// </summary>
public static class SearchBadgeVariants
{
    public const string Routine = SearchBadgeVariant.Routine;
    public const string Urgent = SearchBadgeVariant.Urgent;
    public const string Emergency = SearchBadgeVariant.Emergency;
    public const string Neutral = SearchBadgeVariant.Neutral;

    public static bool IsValid(string? variant) => SearchBadgeVariant.IsValid(variant);
    public static string Normalize(string? variant) => SearchBadgeVariant.Normalize(variant);
}

/// <summary>
/// Visual badge indicator attached to a search result item.
/// </summary>
/// <param name="Text">Badge label text (e.g. "PANIC", "STAT", "Overdue", "Senior").</param>
/// <param name="Variant">Semantic styling variant: "routine", "urgent", "emergency", or "neutral".</param>
public sealed record SearchBadgeDto(
    string Text,
    string Variant = SearchBadgeVariant.Neutral
)
{
    public string Variant { get; init; } = SearchBadgeVariant.Normalize(Variant);
}

/// <summary>
/// Unified immutable DTO representing an individual search match returned from any provider.
/// </summary>
public sealed record SearchResultItemDto
{
    public string Id { get; init; }
    public string Category { get; init; }
    public string Title { get; init; }
    public string Subtitle { get; init; }
    public string? BadgeText { get; init; }
    public string? BadgeVariant { get; init; }
    public string TargetRoute { get; init; }
    public Dictionary<string, string>? RouteParams { get; init; }
    public SearchBadgeDto? Badge { get; init; }

    /// <summary>
    /// Primary constructor supporting both flat badge properties and strongly-typed <see cref="SearchBadgeDto"/>.
    /// Automatically synchronizes Badge, BadgeText, and BadgeVariant.
    /// </summary>
    public SearchResultItemDto(
        string id,
        string category,
        string title,
        string subtitle,
        string? badgeText,
        string? badgeVariant,
        string targetRoute,
        Dictionary<string, string>? routeParams = null,
        SearchBadgeDto? badge = null)
    {
        Id = id ?? throw new ArgumentNullException(nameof(id));
        Category = category ?? throw new ArgumentNullException(nameof(category));
        Title = title ?? throw new ArgumentNullException(nameof(title));
        Subtitle = subtitle ?? string.Empty;
        TargetRoute = targetRoute ?? throw new ArgumentNullException(nameof(targetRoute));
        RouteParams = routeParams;

        if (badge != null)
        {
            Badge = badge;
            BadgeText = badge.Text;
            BadgeVariant = SearchBadgeVariant.Normalize(badge.Variant);
        }
        else if (!string.IsNullOrWhiteSpace(badgeText))
        {
            BadgeText = badgeText;
            BadgeVariant = SearchBadgeVariant.Normalize(badgeVariant);
            Badge = new SearchBadgeDto(BadgeText, BadgeVariant);
        }
        else
        {
            BadgeText = null;
            BadgeVariant = null;
            Badge = null;
        }
    }
}

/// <summary>
/// Standardized envelope wrapping aggregated search results from all active providers.
/// </summary>
/// <param name="Items">Collection of search items.</param>
/// <param name="TotalCount">Total number of returned items.</param>
public sealed record SearchResponseDto(
    IReadOnlyList<SearchResultItemDto> Items,
    int TotalCount
)
{
    public static SearchResponseDto Empty => new(Array.Empty<SearchResultItemDto>(), 0);

    public SearchResponseDto(IReadOnlyList<SearchResultItemDto> items)
        : this(items ?? Array.Empty<SearchResultItemDto>(), items?.Count ?? 0)
    {
    }
}
