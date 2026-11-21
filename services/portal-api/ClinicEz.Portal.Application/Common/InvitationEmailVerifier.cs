using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;

namespace ClinicEz.Portal.Application.Common;

public static class InvitationEmailVerifier
{
    public const string EmailMismatchMessage =
        "This invitation is intended for a different email address. Please sign in with the invited account to continue.";

    public static async Task<string> EnsureEmailMatchesAsync(
        string? invitedEmail,
        string? primaryEmail,
        IReadOnlyList<string>? verifiedEmails,
        string clerkUserId,
        IClerkUserLookup? clerkLookup,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(invitedEmail))
        {
            throw new InvalidOperationException(EmailMismatchMessage);
        }

        var targetEmail = invitedEmail.Trim();
        var resolvedEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (verifiedEmails is not null)
        {
            foreach (var email in verifiedEmails)
            {
                if (!string.IsNullOrWhiteSpace(email))
                {
                    resolvedEmails.Add(email.Trim());
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(primaryEmail))
        {
            resolvedEmails.Add(primaryEmail.Trim());
        }

        if (!resolvedEmails.Contains(targetEmail) &&
            clerkLookup is not null &&
            !string.IsNullOrWhiteSpace(clerkUserId))
        {
            try
            {
                var clerkEmails = await clerkLookup.GetVerifiedEmailsAsync(clerkUserId, cancellationToken);
                if (clerkEmails is not null)
                {
                    foreach (var email in clerkEmails)
                    {
                        if (!string.IsNullOrWhiteSpace(email))
                        {
                            resolvedEmails.Add(email.Trim());
                        }
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Fail closed if authoritative lookup fails and claims did not match.
            }
        }

        if (!resolvedEmails.TryGetValue(targetEmail, out var matchedEmail))
        {
            throw new InvalidOperationException(EmailMismatchMessage);
        }

        return matchedEmail;
    }
}
