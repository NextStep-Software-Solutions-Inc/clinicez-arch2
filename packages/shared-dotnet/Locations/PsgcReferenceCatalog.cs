using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;

namespace ClinicEz.Shared.Locations;

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum PsgcReferenceLevel : byte
{
    Region = 1,
    Province = 2,
    CityMunicipality = 3,
    Barangay = 4
}

public sealed record PsgcReferenceEntry(
    string PsgcCode,
    string Name,
    PsgcReferenceLevel Level,
    string LevelName,
    string? ParentPsgcCode,
    string? RegionPsgc,
    string? ProvincePsgc,
    string? CityMunicipalityPsgc,
    string? ZipCode);

/// <summary>
/// Authoritative, pre-indexed Philippine PSGC 10-digit location catalog covering all 17 Regions,
/// all Provinces/Districts, all Cities &amp; Municipalities, and all Barangays.
/// Loaded once from a compact gzipped embedded resource (~352 KB) and shared across services.
/// </summary>
public static class PsgcReferenceCatalog
{
    private const string ResourceName = "ClinicEz.Shared.Locations.Data.psgc_locations.tsv.gz";

    private sealed class CatalogState
    {
        public required IReadOnlyList<PsgcReferenceEntry> AllEntries { get; init; }
        public required IReadOnlyDictionary<string, PsgcReferenceEntry> ByCode { get; init; }
        public required IReadOnlyList<PsgcReferenceEntry> Regions { get; init; }
        public required IReadOnlyList<PsgcReferenceEntry> AllProvinces { get; init; }
        public required IReadOnlyDictionary<string, IReadOnlyList<PsgcReferenceEntry>> ProvincesByRegion { get; init; }
        public required IReadOnlyList<PsgcReferenceEntry> AllCities { get; init; }
        public required IReadOnlyDictionary<string, IReadOnlyList<PsgcReferenceEntry>> CitiesByProvince { get; init; }
        public required IReadOnlyDictionary<string, IReadOnlyList<PsgcReferenceEntry>> CitiesByRegion { get; init; }
        public required IReadOnlyDictionary<string, IReadOnlyList<PsgcReferenceEntry>> BarangaysByCity { get; init; }
    }

    private static readonly Lazy<CatalogState> State = new(LoadCatalog, isThreadSafe: true);

    public static IReadOnlyList<PsgcReferenceEntry> AllEntries => State.Value.AllEntries;

    public static IReadOnlyDictionary<string, PsgcReferenceEntry> ByCode => State.Value.ByCode;

    public static IReadOnlyList<PsgcReferenceEntry> GetRegions() => State.Value.Regions;

    public static IReadOnlyList<PsgcReferenceEntry> GetProvinces(string? regionPsgc = null)
    {
        if (string.IsNullOrWhiteSpace(regionPsgc))
        {
            return State.Value.AllProvinces;
        }

        return State.Value.ProvincesByRegion.TryGetValue(regionPsgc.Trim(), out var list)
            ? list
            : Array.Empty<PsgcReferenceEntry>();
    }

    public static IReadOnlyList<PsgcReferenceEntry> GetCitiesMunicipalities(string? provincePsgc = null, string? regionPsgc = null)
    {
        if (!string.IsNullOrWhiteSpace(provincePsgc))
        {
            return State.Value.CitiesByProvince.TryGetValue(provincePsgc.Trim(), out var list)
                ? list
                : Array.Empty<PsgcReferenceEntry>();
        }

        if (!string.IsNullOrWhiteSpace(regionPsgc))
        {
            return State.Value.CitiesByRegion.TryGetValue(regionPsgc.Trim(), out var list)
                ? list
                : Array.Empty<PsgcReferenceEntry>();
        }

        return State.Value.AllCities;
    }

    public static IReadOnlyList<PsgcReferenceEntry> GetBarangays(string cityMunicipalityPsgc)
    {
        if (string.IsNullOrWhiteSpace(cityMunicipalityPsgc))
        {
            return Array.Empty<PsgcReferenceEntry>();
        }

        return State.Value.BarangaysByCity.TryGetValue(cityMunicipalityPsgc.Trim(), out var list)
            ? list
            : Array.Empty<PsgcReferenceEntry>();
    }

    public static IReadOnlyList<PsgcReferenceEntry> Search(string? query, int limit = 50)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return Array.Empty<PsgcReferenceEntry>();
        }

        var term = query.Trim();
        var clampedLimit = Math.Clamp(limit, 1, 200);
        var results = new List<PsgcReferenceEntry>(clampedLimit);

        foreach (var entry in State.Value.AllEntries)
        {
            if (entry.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                entry.PsgcCode.StartsWith(term, StringComparison.OrdinalIgnoreCase))
            {
                results.Add(entry);
                if (results.Count >= clampedLimit)
                {
                    break;
                }
            }
        }

        return results;
    }

    private static CatalogState LoadCatalog()
    {
        using var stream = typeof(PsgcReferenceCatalog).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Embedded PSGC resource '{ResourceName}' was not found.");
        using var gzip = new GZipStream(stream, CompressionMode.Decompress);
        using var reader = new StreamReader(gzip);

        var raw = new List<PsgcReferenceEntry>(44000);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var parts = line.Split('\t');
            if (parts.Length < 8)
            {
                continue;
            }

            var (level, levelName) = parts[2] switch
            {
                "R" => (PsgcReferenceLevel.Region, "Region"),
                "P" => (PsgcReferenceLevel.Province, "Province"),
                "C" => (PsgcReferenceLevel.CityMunicipality, "CityMunicipality"),
                "B" => (PsgcReferenceLevel.Barangay, "Barangay"),
                _ => throw new InvalidDataException($"Unknown PSGC level token '{parts[2]}'.")
            };

            raw.Add(new PsgcReferenceEntry(
                PsgcCode: parts[0],
                Name: parts[1],
                Level: level,
                LevelName: levelName,
                ParentPsgcCode: NullIfEmpty(parts[3]),
                RegionPsgc: NullIfEmpty(parts[4]),
                ProvincePsgc: NullIfEmpty(parts[5]),
                CityMunicipalityPsgc: NullIfEmpty(parts[6]),
                ZipCode: NullIfEmpty(parts[7])));
        }

        var orderedAll = raw
            .OrderBy(e => e.Level)
            .ThenBy(e => e.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var byCode = new Dictionary<string, PsgcReferenceEntry>(orderedAll.Length, StringComparer.Ordinal);
        foreach (var entry in orderedAll)
        {
            byCode[entry.PsgcCode] = entry;
        }

        var regions = orderedAll
            .Where(e => e.Level == PsgcReferenceLevel.Region)
            .OrderBy(e => e.PsgcCode, StringComparer.Ordinal)
            .ToArray();

        var allProvinces = orderedAll
            .Where(e => e.Level == PsgcReferenceLevel.Province)
            .OrderBy(e => e.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var provincesByRegion = allProvinces
            .Where(e => !string.IsNullOrEmpty(e.RegionPsgc))
            .GroupBy(e => e.RegionPsgc!, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<PsgcReferenceEntry>)g.ToArray(), StringComparer.Ordinal);

        var allCities = orderedAll
            .Where(e => e.Level == PsgcReferenceLevel.CityMunicipality)
            .OrderBy(e => e.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var citiesByProvince = allCities
            .Where(e => !string.IsNullOrEmpty(e.ProvincePsgc))
            .GroupBy(e => e.ProvincePsgc!, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<PsgcReferenceEntry>)g.ToArray(), StringComparer.Ordinal);

        var citiesByRegion = allCities
            .Where(e => !string.IsNullOrEmpty(e.RegionPsgc))
            .GroupBy(e => e.RegionPsgc!, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<PsgcReferenceEntry>)g.ToArray(), StringComparer.Ordinal);

        var barangaysByCity = orderedAll
            .Where(e => e.Level == PsgcReferenceLevel.Barangay && !string.IsNullOrEmpty(e.CityMunicipalityPsgc))
            .GroupBy(e => e.CityMunicipalityPsgc!, StringComparer.Ordinal)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<PsgcReferenceEntry>)g.OrderBy(e => e.Name, StringComparer.OrdinalIgnoreCase).ToArray(),
                StringComparer.Ordinal);

        return new CatalogState
        {
            AllEntries = orderedAll,
            ByCode = byCode,
            Regions = regions,
            AllProvinces = allProvinces,
            ProvincesByRegion = provincesByRegion,
            AllCities = allCities,
            CitiesByProvince = citiesByProvince,
            CitiesByRegion = citiesByRegion,
            BarangaysByCity = barangaysByCity
        };
    }

    private static string? NullIfEmpty(string value) =>
        string.IsNullOrEmpty(value) ? null : value;
}
