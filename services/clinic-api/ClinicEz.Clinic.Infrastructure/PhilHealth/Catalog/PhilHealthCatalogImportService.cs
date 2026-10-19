using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;

public sealed record PhilHealthCatalogImportResult(
    string Library,
    string KitVersion,
    PhilHealthCatalogImportStatus Status,
    int Added,
    int Updated,
    int Unchanged,
    int Deactivated,
    int DuplicatesIgnored,
    string ContentHash,
    string? Message);

/// <summary>The file or its contents are not a valid library (HTTP 400).</summary>
public sealed class PhilHealthCatalogValidationException(string message) : Exception(message);

/// <summary>Another import is already running (HTTP 409).</summary>
public sealed class PhilHealthCatalogBusyException() : Exception("A PhilHealth Catalog import is already in progress. Try again in a moment.");

public interface IPhilHealthCatalogImportService
{
    /// <summary>
    /// Idempotent import of one PhilHealth library. Upserts on the library's natural key, never hard-deletes (missing items
    /// are deactivated), skips identical content, and never downgrades to an older kit version.
    /// </summary>
    Task<PhilHealthCatalogImportResult> ImportAsync(
        PhilHealthCatalogFile file,
        PhilHealthCatalogImportSource source,
        string actor,
        bool dryRun = false,
        CancellationToken ct = default);
}

public sealed class PhilHealthCatalogImportService : IPhilHealthCatalogImportService
{
    // One import at a time per process. Postgres additionally takes an advisory lock so several API instances stay safe.
    private static readonly SemaphoreSlim Gate = new(1, 1);

    private readonly ApplicationDbContext _db;
    private readonly ILogger<PhilHealthCatalogImportService> _logger;
    private readonly IPhilHealthCatalogCache? _cache;

    public PhilHealthCatalogImportService(ApplicationDbContext db, ILogger<PhilHealthCatalogImportService> logger, IPhilHealthCatalogCache? cache = null)
    {
        _db = db;
        _logger = logger;
        _cache = cache;
    }

    public async Task<PhilHealthCatalogImportResult> ImportAsync(
        PhilHealthCatalogFile file,
        PhilHealthCatalogImportSource source,
        string actor,
        bool dryRun = false,
        CancellationToken ct = default)
    {
        Validate(file);
        var library = file.Library;
        var (items, duplicates) = PhilHealthCatalogKeys.Dedupe(library, file.Items);
        var hash = PhilHealthCatalogKeys.ContentHash(library, items);

        // Seeding waits its turn; an interactive upload fails fast so the administrator is told.
        var acquired = await Gate.WaitAsync(source == PhilHealthCatalogImportSource.Seed ? Timeout.Infinite : 0, ct);
        if (!acquired) throw new PhilHealthCatalogBusyException();

        try
        {
            var relational = _db.Database.IsRelational();
            await using var transaction = relational && !dryRun ? await _db.Database.BeginTransactionAsync(ct) : null;

            if (transaction is not null && _db.Database.IsNpgsql())
            {
                var locked = await _db.Database
                    .SqlQuery<bool>($"SELECT pg_try_advisory_xact_lock(hashtext({"philhealth.catalog." + library})) AS \"Value\"")
                    .SingleAsync(ct);
                if (!locked) throw new PhilHealthCatalogBusyException();
            }

            var applied = await _db.PhilHealthCatalogImportLogs
                .Where(l => l.Library == library && l.Status == PhilHealthCatalogImportStatus.Applied)
                .OrderByDescending(l => l.CreatedAt)
                .ToListAsync(ct);
            var latest = applied.FirstOrDefault();
            var currentVersion = applied
                .Select(l => l.KitVersion)
                .OrderBy(v => v, Comparer<string>.Create(PhilHealthCatalogKeys.CompareVersions))
                .LastOrDefault();

            PhilHealthCatalogImportResult Finish(PhilHealthCatalogImportStatus status, string? message, int added = 0, int updated = 0, int unchanged = 0, int deactivated = 0)
                => new(library, file.KitVersion, status, added, updated, unchanged, deactivated, duplicates, hash, message);

            // Never go back to an older kit than the one in use.
            if (currentVersion is not null && PhilHealthCatalogKeys.CompareVersions(file.KitVersion, currentVersion) < 0)
            {
                var result = Finish(
                    source == PhilHealthCatalogImportSource.Seed ? PhilHealthCatalogImportStatus.Skipped : PhilHealthCatalogImportStatus.Rejected,
                    $"Kit version {file.KitVersion} is older than the version in use ({currentVersion}).");
                return await Record(result, source, actor, dryRun, transaction, ct);
            }

            // The built-in seed never overwrites what an administrator uploaded at the same or a newer version.
            if (source == PhilHealthCatalogImportSource.Seed
                && latest is { Source: PhilHealthCatalogImportSource.Upload }
                && PhilHealthCatalogKeys.CompareVersions(file.KitVersion, latest.KitVersion) <= 0)
            {
                return Finish(PhilHealthCatalogImportStatus.Skipped, "An uploaded version of this library is in use.");
            }

            var existing = await _db.PhilHealthCatalogItems.Where(i => i.Library == library).ToListAsync(ct);

            // Identical content already applied: nothing to do.
            if (latest is not null && latest.ContentHash == hash && existing.Count > 0)
            {
                var same = Finish(PhilHealthCatalogImportStatus.Unchanged, "Content is identical to what is already loaded.", unchanged: existing.Count);
                return source == PhilHealthCatalogImportSource.Seed
                    ? same
                    : await Record(same, source, actor, dryRun, transaction, ct);
            }

            var now = DateTime.UtcNow;
            var byKey = new Dictionary<string, PhilHealthCatalogItem>(StringComparer.Ordinal);
            foreach (var row in existing) byKey.TryAdd(row.ItemKey, row);

            int added = 0, updated = 0, unchanged = 0, deactivated = 0;
            var incomingKeys = new HashSet<string>(StringComparer.Ordinal);
            var created = new List<PhilHealthCatalogItem>();

            foreach (var item in items)
            {
                var key = PhilHealthCatalogKeys.ItemKey(library, item.Code, item.Description);
                incomingKeys.Add(key);
                var attributes = PhilHealthCatalogKeys.AttributesJson(item.Attributes);

                if (byKey.TryGetValue(key, out var row))
                {
                    if (row.Description == item.Description && row.IsActive == item.IsActive && row.AttributesJson == attributes)
                    {
                        unchanged++;
                        if (row.KitVersion != file.KitVersion && !dryRun) row.KitVersion = file.KitVersion;
                        continue;
                    }

                    updated++;
                    if (dryRun) continue;
                    row.Description = item.Description;
                    row.IsActive = item.IsActive;
                    row.AttributesJson = attributes;
                    row.KitVersion = file.KitVersion;
                    row.UpdatedAt = now;
                    row.UpdatedBy = actor;
                }
                else
                {
                    added++;
                    if (dryRun) continue;
                    created.Add(new PhilHealthCatalogItem
                    {
                        Library = library,
                        ItemKey = key,
                        Code = item.Code,
                        Description = item.Description,
                        IsActive = item.IsActive,
                        AttributesJson = attributes,
                        KitVersion = file.KitVersion,
                        CreatedAt = now,
                        CreatedBy = actor,
                    });
                }
            }

            foreach (var row in existing)
            {
                if (incomingKeys.Contains(row.ItemKey) || !row.IsActive) continue;
                deactivated++;
                if (dryRun) continue;
                row.IsActive = false;
                row.UpdatedAt = now;
                row.UpdatedBy = actor;
            }

            if (!dryRun && created.Count > 0) _db.PhilHealthCatalogItems.AddRange(created);

            var outcome = Finish(
                dryRun ? PhilHealthCatalogImportStatus.DryRun : PhilHealthCatalogImportStatus.Applied,
                dryRun ? "Preview only. Nothing was changed." : null,
                added, updated, unchanged, deactivated);
            return await Record(outcome, source, actor, dryRun, transaction, ct);
        }
        finally
        {
            Gate.Release();
        }
    }

    private async Task<PhilHealthCatalogImportResult> Record(
        PhilHealthCatalogImportResult result,
        PhilHealthCatalogImportSource source,
        string actor,
        bool dryRun,
        Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction? transaction,
        CancellationToken ct)
    {
        if (dryRun) return result;

        _db.PhilHealthCatalogImportLogs.Add(new PhilHealthCatalogImportLog
        {
            Library = result.Library,
            KitVersion = result.KitVersion,
            Source = source,
            Status = result.Status,
            ContentHash = result.ContentHash,
            Added = result.Added,
            Updated = result.Updated,
            Unchanged = result.Unchanged,
            Deactivated = result.Deactivated,
            DuplicatesIgnored = result.DuplicatesIgnored,
            Message = result.Message,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = actor,
        });

        await _db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        if (result.Status == PhilHealthCatalogImportStatus.Applied) _cache?.Invalidate(result.Library);

        _logger.LogInformation(
            "PhilHealth Catalog {Library} {Version} ({Source}): {Status} +{Added} ~{Updated} ={Unchanged} -{Deactivated}",
            result.Library, result.KitVersion, source, result.Status, result.Added, result.Updated, result.Unchanged, result.Deactivated);
        return result;
    }

    private static void Validate(PhilHealthCatalogFile file)
    {
        if (!PhilHealthCatalogKeys.IsValidLibraryName(file.Library))
            throw new PhilHealthCatalogValidationException("Library name must look like 'lib_icd' (lowercase letters, digits and underscores).");
        if (string.IsNullOrWhiteSpace(file.KitVersion) || file.KitVersion.Length > 40)
            throw new PhilHealthCatalogValidationException("A kit version (for example 1.1) is required.");
        if (file.Items.Count == 0)
            throw new PhilHealthCatalogValidationException("The file contains no catalog rows. Nothing was changed.");
        if (file.Items.Count > PhilHealthCatalogKeys.MaxItemsPerLibrary)
            throw new PhilHealthCatalogValidationException($"A library may hold at most {PhilHealthCatalogKeys.MaxItemsPerLibrary} rows.");

        foreach (var item in file.Items)
        {
            if (string.IsNullOrWhiteSpace(item.Code) || item.Code.Length > PhilHealthCatalogKeys.MaxCodeLength)
                throw new PhilHealthCatalogValidationException($"Every row needs a code of at most {PhilHealthCatalogKeys.MaxCodeLength} characters.");
            if ((item.Description?.Length ?? 0) > PhilHealthCatalogKeys.MaxDescriptionLength)
                throw new PhilHealthCatalogValidationException($"Description for '{item.Code}' is too long.");
        }
    }
}
