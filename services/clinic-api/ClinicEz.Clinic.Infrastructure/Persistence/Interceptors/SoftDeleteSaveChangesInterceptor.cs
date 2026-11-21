using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;

public sealed class SoftDeleteSaveChangesInterceptor : SaveChangesInterceptor
{
    private readonly ICurrentUserService? _currentUserService;

    public SoftDeleteSaveChangesInterceptor(ICurrentUserService? currentUserService = null)
    {
        _currentUserService = currentUserService;
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        ProcessSoftDeletesAndAuditing(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        ProcessSoftDeletesAndAuditing(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private void ProcessSoftDeletesAndAuditing(DbContext? context)
    {
        if (context is null) return;

        var userId = _currentUserService?.UserId ?? "system";
        var nowUtc = DateTime.UtcNow;

        foreach (var entry in context.ChangeTracker.Entries<IEntity>().ToList())
        {
            // Immutable WORM protection
            if (entry.Entity is AuditEntry)
            {
                if (entry.State is EntityState.Deleted or EntityState.Modified ||
                    (entry.State == EntityState.Added && entry.Entity.IsDeleted))
                {
                    throw new InvalidOperationException(
                        $"AuditEntry is append-only (WORM). {entry.State} mutation on audit record '{entry.Entity.Id}' is strictly prohibited by RA 10173.");
                }
                continue;
            }

            switch (entry.State)
            {
                case EntityState.Added:
                    if (entry.Entity.CreatedAt == default)
                        entry.Entity.CreatedAt = nowUtc;
                    if (string.IsNullOrWhiteSpace(entry.Entity.CreatedBy))
                        entry.Entity.CreatedBy = userId;
                    entry.Entity.IsDeleted = false;
                    break;

                case EntityState.Modified:
                    entry.Entity.UpdatedAt = nowUtc;
                    entry.Entity.UpdatedBy = userId;

                    // If IsDeleted was explicitly set to true via business command
                    if (entry.Property(nameof(IEntity.IsDeleted)).IsModified && entry.Entity.IsDeleted)
                    {
                        entry.Entity.DeletedAt ??= nowUtc;
                        entry.Entity.DeletedBy ??= userId;
                    }
                    break;

                case EntityState.Deleted:
                    if (entry.Entity.AllowHardDelete)
                    {
                        // Allow physical deletion if explicitly opted in
                        break;
                    }

                    // Convert physical DELETE to soft-delete UPDATE
                    entry.State = EntityState.Modified;
                    entry.Entity.IsDeleted = true;
                    entry.Entity.DeletedAt = nowUtc;
                    entry.Entity.DeletedBy = userId;
                    entry.Entity.UpdatedAt = nowUtc;
                    entry.Entity.UpdatedBy = userId;
                    break;
            }
        }
    }
}
