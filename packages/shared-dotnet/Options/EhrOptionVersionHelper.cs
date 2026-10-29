using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace ClinicEz.Shared.Options;

/// <summary>
/// Deterministic SHA-256 ETag and version computation helper for Tier A static option registries
/// and Tier B dynamic global catalog projections.
/// Supports HTTP 304 Not Modified conditional revalidation across backend and frontend caches.
/// </summary>
public static class EhrOptionVersionHelper
{
    /// <summary>
    /// Computes a deterministic SHA-256 hash for a collection of option descriptors.
    /// Items are sorted deterministically by Code (ordinal uppercase) to guarantee identical hashes across processes.
    /// </summary>
    public static string ComputeOptionsSha256(IEnumerable<EhrOptionDescriptor> options)
    {
        ArgumentNullException.ThrowIfNull(options);

        var sorted = options
            .OrderBy(o => o.Code, StringComparer.Ordinal)
            .ToList();

        var sb = new StringBuilder();
        foreach (var opt in sorted)
        {
            sb.Append(opt.Code.ToUpperInvariant()).Append('|')
              .Append(opt.Label).Append('|')
              .Append(opt.PhilHealthCode ?? string.Empty).Append('|')
              .Append(opt.PhilHealthLibrary ?? string.Empty).Append('|')
              .Append(opt.RequiresSpecifyText ? "1" : "0").Append('|')
              .Append(opt.IsActive ? "1" : "0");

            if (opt.Metadata != null && opt.Metadata.Count > 0)
            {
                sb.Append('|');
                var metaSorted = opt.Metadata.OrderBy(m => m.Key, StringComparer.Ordinal);
                foreach (var (k, v) in metaSorted)
                {
                    sb.Append(k).Append('=').Append(v).Append(';');
                }
            }

            sb.Append('\n');
        }

        return ComputeSha256(sb.ToString());
    }

    /// <summary>
    /// Computes a deterministic SHA-256 hash for an entire options manifest dictionary.
    /// Keys are sorted alphabetically (ordinal lowercase), and each set's content hash is aggregated.
    /// </summary>
    public static string ComputeManifestSha256(IReadOnlyDictionary<string, IReadOnlyList<EhrOptionDescriptor>> manifest)
    {
        ArgumentNullException.ThrowIfNull(manifest);

        var sortedSets = manifest
            .OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var sb = new StringBuilder();
        foreach (var (setName, items) in sortedSets)
        {
            var setHash = ComputeOptionsSha256(items);
            sb.Append(setName.ToLowerInvariant()).Append(':').Append(setHash).Append('\n');
        }

        return ComputeSha256(sb.ToString());
    }

    /// <summary>
    /// Computes a deterministic SHA-256 hash for a Tier B dynamic catalog library from string tokens/identifiers.
    /// </summary>
    public static string ComputeCatalogLibrarySha256(string libraryName, IEnumerable<string> items)
    {
        ArgumentNullException.ThrowIfNull(libraryName);
        ArgumentNullException.ThrowIfNull(items);

        var sorted = items.OrderBy(i => i, StringComparer.Ordinal).ToList();
        var sb = new StringBuilder();
        sb.Append(libraryName.ToLowerInvariant()).Append(':');
        foreach (var item in sorted)
        {
            sb.Append(item).Append(';');
        }

        return ComputeSha256(sb.ToString());
    }

    /// <summary>
    /// Formats a raw 64-character lowercase hexadecimal hash as an HTTP entity tag (e.g. <c>"4f8a..."</c>).
    /// </summary>
    public static string FormatETag(string hash)
    {
        if (string.IsNullOrWhiteSpace(hash)) return "\"\"";
        return $"\"{hash.Trim().ToLowerInvariant()}\"";
    }

    /// <summary>
    /// Evaluates an incoming HTTP <c>If-None-Match</c> header against the current resource version hash.
    /// Returns <c>true</c> if any token matches (indicating the client already has the current version, so HTTP 304 can be returned).
    /// Gracefully handles weak tags (<c>W/"..."</c>), quoted strings, and wildcard (<c>*</c>).
    /// </summary>
    public static bool IsMatch(string? ifNoneMatchHeader, string currentVersion)
    {
        if (string.IsNullOrWhiteSpace(ifNoneMatchHeader) || string.IsNullOrWhiteSpace(currentVersion))
            return false;

        var normalizedCurrent = currentVersion.Trim().Trim('"').ToLowerInvariant();
        var tokens = ifNoneMatchHeader.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        foreach (var rawToken in tokens)
        {
            var token = rawToken.Trim();
            if (token == "*") return true;

            // Strip weak ETag prefix
            if (token.StartsWith("W/", StringComparison.OrdinalIgnoreCase))
            {
                token = token[2..].Trim();
            }

            token = token.Trim('"').ToLowerInvariant();

            if (string.Equals(token, normalizedCurrent, StringComparison.Ordinal))
                return true;
        }

        return false;
    }

    private static string ComputeSha256(string rawText)
    {
        var bytes = Encoding.UTF8.GetBytes(rawText);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
