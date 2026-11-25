using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Services;

public sealed class ClerkUserLookup(
    HttpClient httpClient,
    ILogger<ClerkUserLookup> logger) : IClerkUserLookup
{
    public async Task<IReadOnlyList<string>> GetVerifiedEmailsAsync(string clerkUserId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(clerkUserId))
        {
            return Array.Empty<string>();
        }

        if (httpClient.DefaultRequestHeaders.Authorization is null)
        {
            logger.LogError("Clerk:SecretKey is not configured for ClerkUserLookup; unable to verify user email addresses.");
            return Array.Empty<string>();
        }

        try
        {
            var requestUri = $"users/{Uri.EscapeDataString(clerkUserId.Trim())}";
            using var response = await httpClient.GetAsync(requestUri, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                {
                    logger.LogError(
                        "Clerk Backend API rejected user lookup for {UserId} with HTTP {StatusCode}. Verify Clerk:SecretKey configuration.",
                        clerkUserId,
                        (int)response.StatusCode);
                }
                else
                {
                    logger.LogWarning(
                        "Clerk Backend API user lookup for {UserId} returned HTTP {StatusCode}.",
                        clerkUserId,
                        (int)response.StatusCode);
                }

                return Array.Empty<string>();
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            return ParseVerifiedEmailsFromUserJson(json);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to retrieve verified email addresses from Clerk for user {UserId}", clerkUserId);
            return Array.Empty<string>();
        }
    }

    /// <summary>
    /// Extracts verified email addresses directly from Clerk's GET /v1/users/{id} JSON payload
    /// without deserializing unrelated polymorphic User sub-objects (external_accounts, passkeys, etc.).
    /// </summary>
    public static IReadOnlyList<string> ParseVerifiedEmailsFromUserJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<string>();
        }

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
        {
            return Array.Empty<string>();
        }

        string? primaryEmailAddressId = null;
        if (root.TryGetProperty("primary_email_address_id", out var primaryIdProp) &&
            primaryIdProp.ValueKind == JsonValueKind.String)
        {
            primaryEmailAddressId = primaryIdProp.GetString();
        }

        if (!root.TryGetProperty("email_addresses", out var emailAddressesProp) ||
            emailAddressesProp.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        var emails = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var emailEntry in emailAddressesProp.EnumerateArray())
        {
            if (emailEntry.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            if (!emailEntry.TryGetProperty("email_address", out var addressProp) ||
                addressProp.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            var rawAddress = addressProp.GetString();
            if (string.IsNullOrWhiteSpace(rawAddress))
            {
                continue;
            }

            string? emailId = null;
            if (emailEntry.TryGetProperty("id", out var idProp) &&
                idProp.ValueKind == JsonValueKind.String)
            {
                emailId = idProp.GetString();
            }

            if (!IsVerifiedEmailElement(emailEntry, emailId, primaryEmailAddressId))
            {
                continue;
            }

            var normalized = rawAddress.Trim().ToLowerInvariant();
            if (seen.Add(normalized))
            {
                emails.Add(normalized);
            }
        }

        return emails;
    }

    private static bool IsVerifiedEmailElement(JsonElement emailEntry, string? emailId, string? primaryEmailAddressId)
    {
        if (!emailEntry.TryGetProperty("verification", out var verificationProp) ||
            verificationProp.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        if (verificationProp.TryGetProperty("status", out var statusProp) &&
            statusProp.ValueKind == JsonValueKind.String)
        {
            var status = statusProp.GetString()?.Trim();
            if (!string.IsNullOrWhiteSpace(status))
            {
                return string.Equals(status, "verified", StringComparison.OrdinalIgnoreCase);
            }
        }

        return !string.IsNullOrWhiteSpace(primaryEmailAddressId) &&
               string.Equals(emailId, primaryEmailAddressId, StringComparison.Ordinal);
    }
}
