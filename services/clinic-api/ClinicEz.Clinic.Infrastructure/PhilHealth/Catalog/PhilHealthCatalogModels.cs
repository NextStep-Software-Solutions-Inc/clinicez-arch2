using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;

/// <summary>One catalog row in the uniform seed/import shape.</summary>
public sealed record PhilHealthCatalogEntry(
    string Code,
    string Description,
    bool IsActive = true,
    IReadOnlyDictionary<string, string>? Attributes = null);

/// <summary>A whole library: <c>{ "library", "kitVersion", "items": [...] }</c>.</summary>
public sealed record PhilHealthCatalogFile(
    string Library,
    string KitVersion,
    IReadOnlyList<PhilHealthCatalogEntry> Items);

public static partial class PhilHealthCatalogKeys
{
    public const int MaxItemsPerLibrary = 50_000;
    public const int MaxCodeLength = 120;
    public const int MaxDescriptionLength = 2_000;

    /// <summary>Libraries that legitimately repeat a code with different terms (synonyms), so identity includes the term.</summary>
    private static readonly HashSet<string> MultiTermLibraries = new(StringComparer.Ordinal) { "lib_icd" };

    [GeneratedRegex("^lib_[a-z0-9_]{1,60}$")]
    private static partial Regex LibraryNamePattern();

    public static bool IsValidLibraryName(string? library) => library is not null && LibraryNamePattern().IsMatch(library);

    public static string ItemKey(string library, string code, string description) =>
        MultiTermLibraries.Contains(library) ? $"{code}|{TermHash(description)}" : code;

    /// <summary>Short, stable fingerprint of a term so the key stays bounded however long the description is.</summary>
    private static string TermHash(string description) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(description.Trim().ToLowerInvariant())))[..16].ToLowerInvariant();

    /// <summary>Drops repeated identities (first occurrence wins) and returns how many were ignored.</summary>
    public static (List<PhilHealthCatalogEntry> Items, int Duplicates) Dedupe(string library, IEnumerable<PhilHealthCatalogEntry> entries)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var items = new List<PhilHealthCatalogEntry>();
        var duplicates = 0;
        foreach (var entry in entries)
        {
            if (seen.Add(ItemKey(library, entry.Code, entry.Description))) items.Add(entry);
            else duplicates++;
        }
        return (items, duplicates);
    }

    /// <summary>Order-independent SHA-256 of the content (not the kit version), so identical content is recognised.</summary>
    public static string ContentHash(string library, IEnumerable<PhilHealthCatalogEntry> items)
    {
        var lines = items
            .Select(i => $"{ItemKey(library, i.Code, i.Description)}\u001f{i.Code}\u001f{i.Description}\u001f{(i.IsActive ? 1 : 0)}\u001f{AttributesJson(i.Attributes) ?? string.Empty}")
            .OrderBy(l => l, StringComparer.Ordinal);
        var bytes = Encoding.UTF8.GetBytes(library + "\n" + string.Join('\n', lines));
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }

    /// <summary>Canonical (key-sorted) JSON for attributes, or <c>null</c> when there are none.</summary>
    public static string? AttributesJson(IReadOnlyDictionary<string, string>? attributes)
    {
        if (attributes is null || attributes.Count == 0) return null;
        var sorted = new SortedDictionary<string, string>(attributes.ToDictionary(k => k.Key, k => k.Value), StringComparer.Ordinal);
        return JsonSerializer.Serialize(sorted);
    }

    public static IReadOnlyDictionary<string, string>? ParseAttributes(string? json) =>
        string.IsNullOrWhiteSpace(json) ? null : JsonSerializer.Deserialize<Dictionary<string, string>>(json);

    /// <summary>Compares kit versions numerically when possible (1.10 &gt; 1.9), otherwise ordinally.</summary>
    public static int CompareVersions(string? a, string? b)
    {
        if (Version.TryParse(Normalize(a), out var va) && Version.TryParse(Normalize(b), out var vb)) return va.CompareTo(vb);
        return string.Compare(a, b, StringComparison.OrdinalIgnoreCase);

        static string Normalize(string? v)
        {
            var s = (v ?? string.Empty).Trim();
            return s.Contains('.') ? s : s + ".0";
        }
    }

    // Windows-1252 meaning of the C1 control range U+0080..U+009F ('\0' = undefined, dropped).
    private const string Cp1252C1 = "\u20ac\0\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\0\u017d\0\0\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\0\u017e\u0178";

    [GeneratedRegex("_x([0-9A-Fa-f]{4})_")]
    private static partial Regex OoxmlEscape();

    /// <summary>
    /// Normalises spreadsheet text: decodes OOXML <c>_xHHHH_</c> escapes, repairs Windows-1252 control codes that
    /// PhilHealth's files contain (for example an en dash stored as <c>_x0096_</c>), drops other control characters and trims.
    /// </summary>
    public static string CleanText(string value)
    {
        var decoded = OoxmlEscape().Replace(value, m => ((char)Convert.ToInt32(m.Groups[1].Value, 16)).ToString());
        var sb = new StringBuilder(decoded.Length);
        foreach (var ch in decoded)
        {
            if (ch >= 0x80 && ch <= 0x9F)
            {
                var mapped = Cp1252C1[ch - 0x80];
                if (mapped != '\0') sb.Append(mapped);
            }
            else if (ch >= 0x20)
            {
                sb.Append(ch);
            }
        }
        return sb.ToString().Trim();
    }

    public static string FormatNumber(double value) =>
        value == Math.Floor(value) && Math.Abs(value) < 1e15
            ? ((long)value).ToString(CultureInfo.InvariantCulture)
            : value.ToString("R", CultureInfo.InvariantCulture).ToLowerInvariant();
}
