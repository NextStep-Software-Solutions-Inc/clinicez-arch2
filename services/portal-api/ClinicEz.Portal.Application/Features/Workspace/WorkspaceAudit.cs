using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>Who performed a workspace settings change. Passed from the endpoint into each command.</summary>
public sealed record WorkspaceActor(string UserId, string Name, string Role);

/// <summary>Lazy creation of the 1:1 <see cref="WorkspaceSettings"/> row.</summary>
public static class WorkspaceSettingsStore
{
    public static async Task<WorkspaceSettings> GetOrCreateAsync(
        IApplicationDbContext context,
        Tenant tenant,
        CancellationToken cancellationToken)
    {
        var settings = await context.WorkspaceSettings
            .FirstOrDefaultAsync(s => s.TenantId == tenant.Id, cancellationToken);

        if (settings != null) return settings;

        settings = new WorkspaceSettings { TenantId = tenant.Id };
        context.WorkspaceSettings.Add(settings);
        return settings;
    }
}

/// <summary>
/// Collects before/after pairs for a section and stages one <see cref="WorkspaceAuditEntry"/>
/// in the caller's unit of work (so the audit row commits atomically with the change).
/// </summary>
public sealed class WorkspaceChangeSet
{
    private readonly SortedDictionary<string, object> _changes = new(StringComparer.Ordinal);

    public bool HasChanges => _changes.Count > 0;

    /// <summary>Records the change when the values differ. Returns true when changed.</summary>
    public bool Track<T>(string field, T oldValue, T newValue)
    {
        if (EqualityComparer<T>.Default.Equals(oldValue, newValue)) return false;
        _changes[field] = new { old = oldValue, @new = newValue };
        return true;
    }

    public string ToJson() => JsonSerializer.Serialize(_changes);

    /// <summary>Stages an audit entry. No-op when nothing changed. Never pass secrets as tracked values.</summary>
    public void Stage(IApplicationDbContext context, Guid tenantId, WorkspaceActor actor, string section, string action = "updated")
    {
        if (!HasChanges) return;

        context.WorkspaceAuditEntries.Add(new WorkspaceAuditEntry
        {
            TenantId = tenantId,
            ActorUserId = actor.UserId,
            ActorName = actor.Name,
            ActorRole = actor.Role,
            Section = section,
            Action = action,
            ChangesJson = ToJson()
        });
    }
}
