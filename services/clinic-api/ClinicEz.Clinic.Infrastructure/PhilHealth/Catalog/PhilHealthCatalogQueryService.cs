using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;

public sealed record PhilHealthCatalogItemDto(
    string Code,
    string Description,
    bool IsActive,
    IReadOnlyDictionary<string, string>? Attributes);

public sealed record PhilHealthCatalogPage(
    string Library,
    string KitVersion,
    int Total,
    int Skip,
    int Take,
    IReadOnlyList<PhilHealthCatalogItemDto> Items);

public sealed record PhilHealthCatalogLibrarySummary(
    string Library,
    string KitVersion,
    int ItemCount,
    int ActiveCount,
    string ContentHash,
    DateTime LoadedAt,
    PhilHealthCatalogImportSource Source);

public sealed record PhilHealthCatalogImportLogDto(
    DateTime At,
    string Library,
    string KitVersion,
    PhilHealthCatalogImportSource Source,
    PhilHealthCatalogImportStatus Status,
    int Added,
    int Updated,
    int Unchanged,
    int Deactivated,
    int DuplicatesIgnored,
    string? Message,
    string By);

public interface IPhilHealthCatalogQueryService
{
    Task<IReadOnlyList<PhilHealthCatalogLibrarySummary>> GetLibrariesAsync(CancellationToken ct = default);

    Task<PhilHealthCatalogPage?> GetItemsAsync(
        string library,
        string? search,
        bool activeOnly,
        int skip,
        int take,
        CancellationToken ct = default);

    Task<IReadOnlyList<PhilHealthCatalogImportLogDto>> GetImportLogsAsync(int take, CancellationToken ct = default);
}

public sealed class PhilHealthCatalogQueryService : IPhilHealthCatalogQueryService
{
    public const int MaxPageSize = 5_000;

    private readonly ApplicationDbContext _db;

    public PhilHealthCatalogQueryService(ApplicationDbContext db) => _db = db;

    public async Task<IReadOnlyList<PhilHealthCatalogLibrarySummary>> GetLibrariesAsync(CancellationToken ct = default)
    {
        var counts = await _db.PhilHealthCatalogItems
            .GroupBy(i => i.Library)
            .Select(g => new { Library = g.Key, Total = g.Count(), Active = g.Count(i => i.IsActive) })
            .ToListAsync(ct);

        var applied = await _db.PhilHealthCatalogImportLogs
            .Where(l => l.Status == PhilHealthCatalogImportStatus.Applied)
            .OrderByDescending(l => l.CreatedAt)
            .ToListAsync(ct);
        var latest = applied.GroupBy(l => l.Library).ToDictionary(g => g.Key, g => g.First());

        return counts
            .OrderBy(c => c.Library, StringComparer.Ordinal)
            .Select(c =>
            {
                latest.TryGetValue(c.Library, out var log);
                return new PhilHealthCatalogLibrarySummary(
                    c.Library,
                    log?.KitVersion ?? string.Empty,
                    c.Total,
                    c.Active,
                    log?.ContentHash ?? string.Empty,
                    log?.CreatedAt ?? DateTime.MinValue,
                    log?.Source ?? PhilHealthCatalogImportSource.Seed);
            })
            .ToList();
    }

    public async Task<PhilHealthCatalogPage?> GetItemsAsync(
        string library,
        string? search,
        bool activeOnly,
        int skip,
        int take,
        CancellationToken ct = default)
    {
        if (!PhilHealthCatalogKeys.IsValidLibraryName(library)) return null;

        var query = _db.PhilHealthCatalogItems.AsNoTracking().Where(i => i.Library == library);
        if (!await query.AnyAsync(ct)) return null;

        if (activeOnly) query = query.Where(i => i.IsActive);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(i => i.Description.ToLower().Contains(term) || i.Code.ToLower().Contains(term));
        }

        skip = Math.Max(0, skip);
        take = Math.Clamp(take, 1, MaxPageSize);

        var total = await query.CountAsync(ct);
        var rows = await query
            .OrderBy(i => i.Code)
            .ThenBy(i => i.ItemKey)
            .Skip(skip)
            .Take(take)
            .ToListAsync(ct);

        var version = await _db.PhilHealthCatalogImportLogs
            .Where(l => l.Library == library && l.Status == PhilHealthCatalogImportStatus.Applied)
            .OrderByDescending(l => l.CreatedAt)
            .Select(l => l.KitVersion)
            .FirstOrDefaultAsync(ct) ?? string.Empty;

        return new PhilHealthCatalogPage(
            library,
            version,
            total,
            skip,
            take,
            rows.Select(r => new PhilHealthCatalogItemDto(
                r.Code,
                r.Description,
                r.IsActive,
                PhilHealthCatalogKeys.ParseAttributes(r.AttributesJson))).ToList());
    }

    public async Task<IReadOnlyList<PhilHealthCatalogImportLogDto>> GetImportLogsAsync(int take, CancellationToken ct = default)
    {
        take = Math.Clamp(take, 1, 200);
        var logs = await _db.PhilHealthCatalogImportLogs
            .AsNoTracking()
            .OrderByDescending(l => l.CreatedAt)
            .Take(take)
            .ToListAsync(ct);

        return logs
            .Select(l => new PhilHealthCatalogImportLogDto(
                l.CreatedAt, l.Library, l.KitVersion, l.Source, l.Status,
                l.Added, l.Updated, l.Unchanged, l.Deactivated, l.DuplicatesIgnored, l.Message, l.CreatedBy))
            .ToList();
    }
}
