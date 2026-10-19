using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Search;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Dental.Search;

/// <summary>
/// Pluggable domain search provider querying patient dental chart records, tooth states,
/// affected surfaces, and clinical notes with strict multi-tenant isolation.
/// Auto-discovered by <see cref="SearchServiceExtensions.AddPluggableSearch"/>.
/// </summary>
public sealed class DentalChartSearchProvider : ISearchProvider
{
    private readonly IRepository<DentalToothRecord> _toothRepo;

    public string Category => "Dental";
    public int Priority => 25;
    public string? RequiredPermission => ClinicPermissions.ConsultationsRead;

    public DentalChartSearchProvider(IRepository<DentalToothRecord> toothRepo)
    {
        _toothRepo = toothRepo ?? throw new ArgumentNullException(nameof(toothRepo));
    }

    public async Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query,
        Guid tenantId,
        int limit,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(query))
            return Array.Empty<SearchResultItemDto>();

        ct.ThrowIfCancellationRequested();

        var term = query.Trim().ToLowerInvariant();
        var boundedLimit = limit <= 0 ? 10 : Math.Min(limit, 50);

        var targetToothNumber = TryParseToothNumber(term);
        var targetStatus = TryParseToothStatus(term);
        var isGeneralDentalQuery = term is "dental" or "tooth" or "teeth" or "chart" or "odontogram";

        var teeth = await _toothRepo.Query(t => !t.IsDeleted && t.ClinicId == tenantId, ignoreQueryFilters: true)
            .AsNoTracking()
            .Where(t =>
                isGeneralDentalQuery ||
                (targetToothNumber.HasValue && t.ToothNumber == targetToothNumber.Value) ||
                (targetStatus.HasValue && t.Status == targetStatus.Value) ||
                (t.PatientName != null && t.PatientName.ToLower().Contains(term)) ||
                (t.Surface != null && t.Surface.ToLower().Contains(term)) ||
                (t.Notes != null && t.Notes.ToLower().Contains(term)))
            .OrderBy(t => t.ToothNumber)
            .Take(boundedLimit)
            .ToListAsync(ct);

        return teeth.Select(tooth =>
        {
            var statusText = tooth.Status.ToString();
            var badgeVariant = MapBadgeVariant(tooth.Status);
            var surfaceSuffix = string.IsNullOrWhiteSpace(tooth.Surface) ? string.Empty : $" ({tooth.Surface})";
            var notesSuffix = string.IsNullOrWhiteSpace(tooth.Notes) ? string.Empty : $" • {tooth.Notes}";

            return new SearchResultItemDto(
                id: $"dental-{tooth.Id}",
                category: Category,
                title: $"Tooth #{tooth.ToothNumber} — {tooth.Status}{surfaceSuffix}",
                subtitle: $"Patient: {tooth.PatientName ?? "Unknown"}{notesSuffix}",
                badgeText: statusText,
                badgeVariant: badgeVariant,
                targetRoute: "Patients",
                routeParams: new Dictionary<string, string>
                {
                    { "patientId", tooth.PatientId.ToString() },
                    { "toothNumber", tooth.ToothNumber.ToString() },
                    { "tab", "dental" }
                },
                badge: new SearchBadgeDto(statusText, badgeVariant)
            );
        }).ToList();
    }

    /// <summary>
    /// Parses tooth numbers from query terms like "16", "#16", "tooth 16", "Tooth #16", "t16", "t#16", "tooth#16".
    /// </summary>
    public static int? TryParseToothNumber(string term)
    {
        if (string.IsNullOrWhiteSpace(term))
            return null;

        var cleaned = term.Trim().ToLowerInvariant();

        // Direct numeric: e.g. "16", "55"
        if (int.TryParse(cleaned, out var directNum))
            return directNum;

        // Hash prefix: e.g. "#16", "# 16"
        if (cleaned.StartsWith('#'))
        {
            var hashRemainder = cleaned.TrimStart('#').Trim();
            if (int.TryParse(hashRemainder, out var hashNum))
                return hashNum;
        }

        // "tooth" prefix: e.g. "tooth 16", "tooth #16", "tooth16", "tooth#16"
        if (cleaned.StartsWith("tooth"))
        {
            var toothRemainder = cleaned.Substring(5).Trim().TrimStart('#').Trim();
            if (int.TryParse(toothRemainder, out var toothNum))
                return toothNum;
        }

        // Short "t" prefix: e.g. "t16", "t#16"
        if (cleaned.StartsWith('t') && cleaned.Length > 1)
        {
            var tRemainder = cleaned.Substring(1).Trim().TrimStart('#').Trim();
            if (int.TryParse(tRemainder, out var tNum))
                return tNum;
        }

        return null;
    }

    /// <summary>
    /// Matches plain-English clinical status keywords ("decay", "filled", "missing", "crown", "extraction", "healthy").
    /// </summary>
    public static ToothStatus? TryParseToothStatus(string term)
    {
        if (string.IsNullOrWhiteSpace(term))
            return null;

        var cleaned = term.Trim().ToLowerInvariant();
        return cleaned switch
        {
            "healthy" => ToothStatus.Healthy,
            "decay" => ToothStatus.Decay,
            "filled" => ToothStatus.Filled,
            "missing" => ToothStatus.Missing,
            "crown" => ToothStatus.Crown,
            "extraction" => ToothStatus.Extraction,
            _ => null
        };
    }

    /// <summary>
    /// Maps tooth status to design-token semantic badge variants:
    /// Decay -> Urgent ("urgent")
    /// Extraction -> Emergency ("emergency")
    /// Filled -> Routine ("routine")
    /// Crown, Healthy, Missing -> Neutral ("neutral")
    /// </summary>
    public static string MapBadgeVariant(ToothStatus status) => status switch
    {
        ToothStatus.Decay => SearchBadgeVariant.Urgent,
        ToothStatus.Extraction => SearchBadgeVariant.Emergency,
        ToothStatus.Filled => SearchBadgeVariant.Routine,
        ToothStatus.Crown => SearchBadgeVariant.Neutral,
        ToothStatus.Healthy or ToothStatus.Missing => SearchBadgeVariant.Neutral,
        _ => SearchBadgeVariant.Neutral
    };
}
