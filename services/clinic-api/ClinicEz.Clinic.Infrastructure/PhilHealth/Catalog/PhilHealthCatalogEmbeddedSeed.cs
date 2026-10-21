using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;

/// <summary>Reads the PhilHealth Catalog JSON files that ship inside the assembly.</summary>
public static class PhilHealthCatalogEmbeddedSeed
{
    public const string ResourcePrefix = "PhilHealthCatalog.Seed.";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new StrictJsonStringEnumConverter() },
    };

    private sealed record SeedFile(string Library, string KitVersion, List<SeedItem> Items);

    private sealed record SeedItem(string Code, string Description, bool IsActive = true, Dictionary<string, string>? Attributes = null);

    public static IReadOnlyList<string> ResourceNames { get; } = typeof(PhilHealthCatalogEmbeddedSeed).Assembly
        .GetManifestResourceNames()
        .Where(n => n.StartsWith(ResourcePrefix, StringComparison.Ordinal) && n.EndsWith(".json", StringComparison.Ordinal))
        .OrderBy(n => n, StringComparer.Ordinal)
        .ToList();

    public static IEnumerable<PhilHealthCatalogFile> ReadAll()
    {
        foreach (var name in ResourceNames)
        {
            using var stream = typeof(PhilHealthCatalogEmbeddedSeed).Assembly.GetManifestResourceStream(name)!;
            yield return Parse(stream);
        }
    }

    /// <summary>Parses the uniform <c>{ library, kitVersion, items }</c> JSON (seed files and JSON uploads).</summary>
    public static PhilHealthCatalogFile Parse(Stream json)
    {
        SeedFile? file;
        try
        {
            file = JsonSerializer.Deserialize<SeedFile>(json, Json);
        }
        catch (JsonException ex)
        {
            throw new PhilHealthCatalogValidationException($"The JSON file could not be read: {ex.Message}");
        }

        if (file is null || file.Items is null)
            throw new PhilHealthCatalogValidationException("The JSON file must contain library, kitVersion and items.");

        return new PhilHealthCatalogFile(
            file.Library ?? string.Empty,
            file.KitVersion ?? string.Empty,
            file.Items
                .Select(i => new PhilHealthCatalogEntry(
                    (i.Code ?? string.Empty).Trim(),
                    (i.Description ?? string.Empty).Trim(),
                    i.IsActive,
                    i.Attributes is { Count: > 0 } ? i.Attributes : null))
                .ToList());
    }
}
