using System.Collections.Concurrent;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;

/// <summary>Cache that must be told when a library changed.</summary>
public interface IPhilHealthCatalogCache
{
    void Invalidate(string library);
}

/// <summary>
/// In-memory snapshot of the catalog, loaded lazily per library from the database (or fixed from files for tests) and
/// dropped whenever an import changes that library.
/// </summary>
public sealed class PhilHealthCatalogLookup : IPhilHealthCatalogLookup, IPhilHealthCatalogCache
{
    private sealed class Snapshot
    {
        public required IReadOnlyList<PhilHealthCatalogRecord> Records { get; init; }
        public required Dictionary<string, PhilHealthCatalogRecord> ByCode { get; init; }
        public required Dictionary<string, PhilHealthCatalogRecord> ByDescription { get; init; }
        public required string[] LowerDescriptions { get; init; }
    }

    private readonly IServiceScopeFactory? _scopes;
    private readonly IReadOnlyDictionary<string, IReadOnlyList<PhilHealthCatalogRecord>>? _fixed;
    private readonly ConcurrentDictionary<string, Lazy<Snapshot>> _snapshots = new(StringComparer.Ordinal);

    public PhilHealthCatalogLookup(IServiceScopeFactory scopes) => _scopes = scopes;

    private PhilHealthCatalogLookup(IReadOnlyDictionary<string, IReadOnlyList<PhilHealthCatalogRecord>> fixedData) => _fixed = fixedData;

    /// <summary>A lookup over the given files (used by tests and tools; not backed by the database).</summary>
    public static PhilHealthCatalogLookup FromFiles(IEnumerable<PhilHealthCatalogFile> files) =>
        new(files.ToDictionary(
            f => f.Library,
            f => (IReadOnlyList<PhilHealthCatalogRecord>)f.Items
                .Select(i => new PhilHealthCatalogRecord(f.Library, i.Code, i.Description, i.IsActive, i.Attributes))
                .ToList()));

    /// <summary>A lookup over the bundled PhilHealth Catalog seed.</summary>
    public static PhilHealthCatalogLookup FromBundledSeed() => FromFiles(PhilHealthCatalogEmbeddedSeed.ReadAll());

    public void Invalidate(string library) => _snapshots.TryRemove(library, out _);

    public PhilHealthCatalogRecord? Find(string library, string code) =>
        string.IsNullOrWhiteSpace(code) ? null : Get(library).ByCode.GetValueOrDefault(code.Trim());

    public PhilHealthCatalogRecord? FindByDescription(string library, string description) =>
        string.IsNullOrWhiteSpace(description) ? null : Get(library).ByDescription.GetValueOrDefault(description.Trim().ToLowerInvariant());

    public IReadOnlyList<PhilHealthCatalogRecord> Search(string library, IReadOnlyCollection<string> tokens, int limit = 20)
    {
        var wanted = tokens.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim().ToLowerInvariant()).ToArray();
        if (wanted.Length == 0) return [];

        var snapshot = Get(library);
        var matches = new List<PhilHealthCatalogRecord>();
        for (var i = 0; i < snapshot.Records.Count; i++)
        {
            var record = snapshot.Records[i];
            if (!record.IsActive) continue;
            var description = snapshot.LowerDescriptions[i];
            if (wanted.All(description.Contains)) matches.Add(record);
        }

        return matches
            .OrderBy(r => r.Description.Length)
            .ThenBy(r => r.Code, StringComparer.Ordinal)
            .Take(Math.Max(1, limit))
            .ToList();
    }

    private Snapshot Get(string library) =>
        _snapshots.GetOrAdd(library, key => new Lazy<Snapshot>(() => Load(key), LazyThreadSafetyMode.ExecutionAndPublication)).Value;

    private Snapshot Load(string library)
    {
        IReadOnlyList<PhilHealthCatalogRecord> records;
        if (_fixed is not null)
        {
            records = _fixed.GetValueOrDefault(library) ?? [];
        }
        else
        {
            using var scope = _scopes!.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            records = db.PhilHealthCatalogItems
                .AsNoTracking()
                .Where(i => i.Library == library)
                .OrderBy(i => i.CreatedAt)
                .ThenBy(i => i.Code)
                .AsEnumerable()
                .Select(i => new PhilHealthCatalogRecord(library, i.Code, i.Description, i.IsActive, PhilHealthCatalogKeys.ParseAttributes(i.AttributesJson)))
                .ToList();
        }

        var byCode = new Dictionary<string, PhilHealthCatalogRecord>(StringComparer.Ordinal);
        var byDescription = new Dictionary<string, PhilHealthCatalogRecord>(StringComparer.Ordinal);
        foreach (var record in records)
        {
            byCode.TryAdd(record.Code, record);
            if (record.IsActive) byDescription.TryAdd(record.Description.Trim().ToLowerInvariant(), record);
        }

        return new Snapshot
        {
            Records = records,
            ByCode = byCode,
            ByDescription = byDescription,
            LowerDescriptions = records.Select(r => r.Description.ToLowerInvariant()).ToArray(),
        };
    }
}
