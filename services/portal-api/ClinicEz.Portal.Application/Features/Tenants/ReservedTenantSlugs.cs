using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace ClinicEz.Portal.Application.Features.Tenants;

/// <summary>
/// Canonical DNS label rules and reserved subdomain names that cannot be claimed as tenant workspace slugs.
/// </summary>
public static partial class ReservedTenantSlugs
{
    public const int MaxSlugLength = 63;

    public const string DnsLabelPattern = "^[a-z0-9]+(?:-[a-z0-9]+)*$";

    public const string ReservedSlugMessage = "This workplace URL slug is reserved by Clinic EZ. Please choose another.";

    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "home",
        "www",
        "portal",
        "admin",
        "app",
        "api",
        "dev",
        "stage",
        "staging",
        "prod",
        "production",
        "test",
        "clinic",
        "clinics",
        "lab",
        "laboratory",
        "laboratories",
        "pharmacy",
        "pharmacies",
        "org",
        "organization",
        "organizations",
        "cashier",
        "patient",
        "patients",
        "hub",
        "interop",
        "interop-hub",
        "billing",
        "billing-api",
        "portal-api",
        "clinic-api",
        "laboratory-api",
        "pharmacy-api",
        "organization-api",
        "patient-api",
        "comms-api",
        "media-broker",
        "philhealth",
        "philhealth-proxy",
        "clerk",
        "auth",
        "login",
        "mail",
        "smtp",
        "imap",
        "pop",
        "cdn",
        "static",
        "assets",
        "media",
        "files",
        "docs",
        "status",
        "support",
        "help",
        "blog",
        "blogs",
        "marketing",
        "go",
        "web",
        "site",
        "dashboard",
        "console",
        "workspace",
        "root",
        "localhost"
    };

    public static IReadOnlySet<string> All => Reserved;

    public static bool IsReserved(string? slug)
    {
        if (string.IsNullOrWhiteSpace(slug))
        {
            return false;
        }

        return Reserved.Contains(slug.Trim());
    }

    public static bool IsValidDnsLabel(string? slug)
    {
        if (string.IsNullOrEmpty(slug) || slug.Length > MaxSlugLength)
        {
            return false;
        }

        return DnsLabelRegex().IsMatch(slug);
    }

    [GeneratedRegex(DnsLabelPattern, RegexOptions.CultureInvariant)]
    private static partial Regex DnsLabelRegex();
}
