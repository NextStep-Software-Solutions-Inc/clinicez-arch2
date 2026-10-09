using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>
/// The workspace's allow-list of email domains staff may be invited from. Stored as a lower-cased,
/// comma-separated string; an empty list means any domain is accepted.
/// </summary>
public static partial class InviteDomains
{
    public const int MaxDomains = 20;

    [GeneratedRegex(@"^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")]
    private static partial Regex DomainPattern();

    public static IReadOnlyList<string> Parse(string? stored) =>
        string.IsNullOrWhiteSpace(stored)
            ? []
            : stored.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    public static string? Serialize(IEnumerable<string> domains)
    {
        var list = domains.ToList();
        return list.Count == 0 ? null : string.Join(',', list);
    }

    /// <summary>Lower-cases, strips a leading "@", de-duplicates and keeps first-seen order.</summary>
    public static List<string> Normalize(IEnumerable<string>? raw) =>
        (raw ?? [])
            .Select(d => (d ?? string.Empty).Trim().TrimStart('@').ToLowerInvariant())
            .Where(d => d.Length > 0)
            .Distinct()
            .ToList();

    public static bool IsValidDomain(string domain) => DomainPattern().IsMatch(domain);

    /// <summary>True when the list is empty or the email's domain is on it. Malformed emails are rejected when a list exists.</summary>
    public static bool IsAllowed(string? stored, string? email)
    {
        var allowed = Parse(stored);
        if (allowed.Count == 0) return true;

        var at = email?.LastIndexOf('@') ?? -1;
        if (email is null || at < 0 || at == email.Length - 1) return false;

        var domain = email[(at + 1)..].Trim().ToLowerInvariant();
        return allowed.Contains(domain);
    }
}
