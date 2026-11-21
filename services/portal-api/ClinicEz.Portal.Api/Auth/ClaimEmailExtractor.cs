using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;

namespace ClinicEz.Portal.Api.Auth;

public static class ClaimEmailExtractor
{
    private static readonly string[] SingleEmailClaimTypes =
    [
        ClaimTypes.Email,
        "email",
        "email_address",
        "primary_email_address"
    ];

    public static IReadOnlyList<string> ExtractVerifiedEmails(ClaimsPrincipal? principal)
    {
        if (principal is null)
        {
            return Array.Empty<string>();
        }

        var emails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var emailVerifiedClaim = principal.FindFirst("email_verified")?.Value;
        var isExplicitlyUnverified =
            !string.IsNullOrWhiteSpace(emailVerifiedClaim) &&
            string.Equals(emailVerifiedClaim.Trim(), "false", StringComparison.OrdinalIgnoreCase);

        if (!isExplicitlyUnverified)
        {
            foreach (var claimType in SingleEmailClaimTypes)
            {
                foreach (var claim in principal.FindAll(claimType))
                {
                    AddClaimValue(emails, claim.Value);
                }
            }
        }

        foreach (var claim in principal.FindAll("emails"))
        {
            AddClaimValue(emails, claim.Value);
        }

        return emails.ToList();
    }

    private static void AddClaimValue(HashSet<string> emails, string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return;
        }

        var trimmed = rawValue.Trim();
        if (trimmed.StartsWith('[') && trimmed.EndsWith(']'))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<string[]>(trimmed);
                if (parsed is not null)
                {
                    foreach (var item in parsed)
                    {
                        if (!string.IsNullOrWhiteSpace(item))
                        {
                            emails.Add(item.Trim());
                        }
                    }
                    return;
                }
            }
            catch (JsonException)
            {
                // Fall back to delimiter split below.
            }
        }

        foreach (var part in trimmed.Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!string.IsNullOrWhiteSpace(part))
            {
                emails.Add(part);
            }
        }
    }
}
