using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;

namespace ClinicEz.Patient.Api.Auth;

/// <summary>
/// Extracts verified email addresses from Clerk JWT claims so migrated legacy accounts
/// (where ClerkUserId is null) can be safely reclaimed upon first Clerk sign-in.
/// </summary>
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
            return Array.Empty<string>();

        var verifiedClaims = principal.FindAll("email_verified")
            .Select(c => c.Value?.Trim())
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .ToList();

        var isExplicitlyVerified =
            verifiedClaims.Count > 0 &&
            verifiedClaims.All(v => string.Equals(v, "true", StringComparison.OrdinalIgnoreCase));

        if (!isExplicitlyVerified)
            return Array.Empty<string>();

        var emails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var claimType in SingleEmailClaimTypes)
        {
            foreach (var claim in principal.FindAll(claimType))
                AddClaimValue(emails, claim.Value);
        }

        foreach (var claim in principal.FindAll("emails"))
            AddClaimValue(emails, claim.Value);

        return emails.ToList();
    }

    private static void AddClaimValue(HashSet<string> emails, string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
            return;

        var trimmed = rawValue.Trim();
        if (trimmed.StartsWith('[') && trimmed.EndsWith(']'))
        {
            try
            {
                using var doc = JsonDocument.Parse(trimmed);
                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var element in doc.RootElement.EnumerateArray())
                    {
                        if (element.ValueKind == JsonValueKind.String)
                        {
                            var value = element.GetString();
                            if (!string.IsNullOrWhiteSpace(value))
                                emails.Add(value.Trim().ToLowerInvariant());
                        }
                        else if (element.ValueKind == JsonValueKind.Object &&
                                 TryExtractObjectEmail(element, out var objectEmail))
                        {
                            emails.Add(objectEmail!);
                        }
                    }
                }
            }
            catch (JsonException)
            {
                // Malformed JSON array must not fall back to delimiter splitting.
            }

            return;
        }

        foreach (var part in trimmed.Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!string.IsNullOrWhiteSpace(part))
                emails.Add(part.ToLowerInvariant());
        }
    }

    private static bool TryExtractObjectEmail(JsonElement obj, out string? email)
    {
        string[] candidateKeys = ["email", "email_address", "emailAddress"];
        foreach (var candidateKey in candidateKeys)
        {
            foreach (var prop in obj.EnumerateObject())
            {
                if (string.Equals(prop.Name, candidateKey, StringComparison.OrdinalIgnoreCase) &&
                    prop.Value.ValueKind == JsonValueKind.String)
                {
                    var val = prop.Value.GetString();
                    if (!string.IsNullOrWhiteSpace(val))
                    {
                        email = val.Trim().ToLowerInvariant();
                        return true;
                    }
                }
            }
        }

        email = null;
        return false;
    }
}
