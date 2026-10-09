using Clerk.BackendAPI;
using Clerk.BackendAPI.Models.Operations;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Services;

/// <summary>
/// Writes <c>ownedTenantId</c> and <c>memberships</c> into the user's Clerk public metadata. Failures are logged and
/// swallowed: the database is the source of truth and the mirror is rebuilt on the user's next membership change.
/// </summary>
public sealed class ClerkMetadataSync(
    IApplicationDbContext context,
    ClerkBackendApi clerk,
    ILogger<ClerkMetadataSync> logger) : IClerkMetadataSync
{
    public async Task SyncAsync(string userId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(userId)) return;

        try
        {
            var ownedTenantId = await context.Tenants
                .AsNoTracking()
                .Where(t => t.OwnerId == userId)
                .Select(t => (Guid?)t.Id)
                .FirstOrDefaultAsync(cancellationToken);

            var memberships = await context.WorkspaceMembers
                .AsNoTracking()
                .Where(m => m.UserId == userId && m.Status == MemberStatus.Active)
                .Select(m => new { m.TenantId, m.Role })
                .ToListAsync(cancellationToken);

            var metadata = new Dictionary<string, object>
            {
                ["ownedTenantId"] = ownedTenantId?.ToString() ?? string.Empty,
                ["memberships"] = memberships
                    .Select(m => new Dictionary<string, object>
                    {
                        ["tenantId"] = m.TenantId.ToString(),
                        ["role"] = m.Role.ToString()
                    })
                    .ToList()
            };

            await clerk.Users.UpdateMetadataAsync(userId, new UpdateUserMetadataRequestBody { PublicMetadata = metadata });
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Could not mirror workspace ownership/memberships to Clerk metadata for user {UserId}.", userId);
        }
    }
}
