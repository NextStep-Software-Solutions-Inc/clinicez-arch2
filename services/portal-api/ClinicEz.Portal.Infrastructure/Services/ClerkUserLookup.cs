using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Clerk.BackendAPI;
using Clerk.BackendAPI.Models.Operations;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Services;

public sealed class ClerkUserLookup(
    ClerkBackendApi clerk,
    ILogger<ClerkUserLookup> logger) : IClerkUserLookup
{
    public async Task<IReadOnlyList<string>> GetVerifiedEmailsAsync(string clerkUserId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(clerkUserId))
        {
            return Array.Empty<string>();
        }

        try
        {
            var response = await clerk.Users.GetAsync(clerkUserId);
            var user = response?.User;
            if (user?.EmailAddresses == null)
            {
                return Array.Empty<string>();
            }

            var emails = new List<string>();
            foreach (var emailObj in user.EmailAddresses)
            {
                if (string.IsNullOrWhiteSpace(emailObj.EmailAddressValue))
                {
                    continue;
                }

                if (IsVerifiedEmail(emailObj, user.PrimaryEmailAddressId))
                {
                    emails.Add(emailObj.EmailAddressValue.Trim().ToLowerInvariant());
                }
            }

            return emails.Distinct().ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Failed to retrieve verified email addresses from Clerk for user {UserId}", clerkUserId);
            return Array.Empty<string>();
        }
    }

    private static bool IsVerifiedEmail(Clerk.BackendAPI.Models.Components.EmailAddress emailObj, string? primaryEmailAddressId)
    {
        if (!string.IsNullOrWhiteSpace(primaryEmailAddressId) &&
            string.Equals(emailObj.Id, primaryEmailAddressId, StringComparison.Ordinal))
        {
            return true;
        }

        var verification = emailObj.Verification;
        if (verification == null)
        {
            return false;
        }

        // Speakeasy union wrapper exposes one populated verification strategy object (Otp, Admin, FromOAuth, Ticket, Saml, etc.)
        foreach (var prop in verification.GetType().GetProperties())
        {
            if (prop.Name is "Type" or "Typ") continue;
            var branch = prop.GetValue(verification);
            if (branch == null) continue;

            var statusProp = branch.GetType().GetProperty("Status");
            var statusVal = statusProp?.GetValue(branch)?.ToString();
            if (!string.IsNullOrWhiteSpace(statusVal) &&
                statusVal.Contains("verified", StringComparison.OrdinalIgnoreCase) &&
                !statusVal.Contains("unverified", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
