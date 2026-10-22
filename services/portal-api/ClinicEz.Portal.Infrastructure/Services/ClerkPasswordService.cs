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

public sealed class ClerkPasswordService(
    ClerkBackendApi clerk,
    ILogger<ClerkPasswordService> logger) : IClerkPasswordService
{
    public async Task SetUserPasswordAsync(
        string? clerkUserId,
        string email,
        string newPassword,
        CancellationToken cancellationToken = default)
    {
        var targetUserId = clerkUserId?.Trim();

        if (string.IsNullOrWhiteSpace(targetUserId) && !string.IsNullOrWhiteSpace(email))
        {
            var listResponse = await clerk.Users.ListAsync(new GetUserListRequest
            {
                EmailAddress = new List<string> { email.Trim() },
                Limit = 1
            });

            targetUserId = listResponse.UserList?.FirstOrDefault()?.Id;
        }

        if (string.IsNullOrWhiteSpace(targetUserId))
        {
            throw new InvalidOperationException(
                $"No linked identity account was found for '{email}'. The user must complete account registration or accept their invitation first.");
        }

        await clerk.Users.UpdateAsync(
            targetUserId,
            new UpdateUserRequestBody
            {
                Password = newPassword,
                SignOutOfOtherSessions = true
            });

        logger.LogInformation("Updated Clerk password and signed out other sessions for user {ClerkUserId} ({Email}).", targetUserId, email);
    }
}
