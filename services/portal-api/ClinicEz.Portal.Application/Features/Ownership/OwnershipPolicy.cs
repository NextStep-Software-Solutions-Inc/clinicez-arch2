using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Portal.Application.Features.Ownership;

/// <summary>
/// One person owns at most one workspace (<c>Workspace:MaxOwnedPerUser</c>, default 1). Archived workspaces still hold
/// the slot until they are purged. Membership of other workspaces is unlimited and never confers ownership.
/// </summary>
public interface IOwnershipPolicy
{
    int MaxOwnedPerUser { get; }

    /// <summary>The Id of the workspace the user owns, or null.</summary>
    Task<Guid?> GetOwnedTenantIdAsync(string userId, CancellationToken cancellationToken);

    /// <summary>
    /// Throws a 409 <see cref="CodedConflictException"/> (<paramref name="conflictCode"/>) when the user is already at their ownership limit.
    /// </summary>
    Task EnsureCanOwnAsync(string userId, string conflictCode, CancellationToken cancellationToken);

    /// <summary>
    /// Saves the pending changes. A concurrent request that slips past <see cref="EnsureCanOwnAsync"/> trips the unique
    /// owner index; that is reported as the same 409 instead of a 500.
    /// </summary>
    Task SaveAsync(string conflictCode, CancellationToken cancellationToken);
}

public sealed class OwnershipPolicy(
    IApplicationDbContext context,
    IConfiguration configuration,
    ISystemSettingsService? settingsService = null) : IOwnershipPolicy
{
    public int MaxOwnedPerUser => Math.Max(1, configuration.GetValue("Workspace:MaxOwnedPerUser", 1));

    public async Task<Guid?> GetOwnedTenantIdAsync(string userId, CancellationToken cancellationToken)
    {
        var id = await context.Tenants
            .AsNoTracking()
            .Where(t => t.OwnerId == userId)
            .Select(t => (Guid?)t.Id)
            .FirstOrDefaultAsync(cancellationToken);
        return id;
    }

    public async Task EnsureCanOwnAsync(string userId, string conflictCode, CancellationToken cancellationToken)
    {
        var maxOwned = MaxOwnedPerUser;
        if (settingsService is not null && string.IsNullOrWhiteSpace(configuration["Workspace:MaxOwnedPerUser"]))
        {
            maxOwned = Math.Max(1, await settingsService.GetSettingIntAsync("Workspace:MaxOwnedPerUser", maxOwned, cancellationToken));
        }

        var owned = await context.Tenants.CountAsync(t => t.OwnerId == userId, cancellationToken);
        if (owned >= maxOwned)
        {
            throw ConflictFor(conflictCode);
        }
    }

    public async Task SaveAsync(string conflictCode, CancellationToken cancellationToken)
    {
        try
        {
            await context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (IsOwnerIndexViolation(ex))
        {
            throw ConflictFor(conflictCode);
        }
    }

    public static bool IsOwnerIndexViolation(DbUpdateException exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current.Message.Contains(Tenant.UniqueOwnerIndexName, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

    private static CodedConflictException ConflictFor(string code) => code == ConflictCodes.TargetAlreadyOwnsWorkspace
        ? new CodedConflictException(code, "That person already owns a workspace, so they cannot take ownership of another one.")
        : new CodedConflictException(code, "You already own a workspace. Each person can own only one; you can still be a member of others.");
}
