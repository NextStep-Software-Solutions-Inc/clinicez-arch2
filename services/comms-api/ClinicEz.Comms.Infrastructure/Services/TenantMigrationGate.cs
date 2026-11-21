using System;
using System.Collections.Concurrent;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Domain.Entities;

namespace ClinicEz.Comms.Infrastructure.Services;

public class TenantMigrationGate : ITenantMigrationGate
{
    private readonly ConcurrentDictionary<string, TenantMigrationState> _states = new(StringComparer.OrdinalIgnoreCase);

    public bool IsTenantLocked(string tenantId)
    {
        if (string.IsNullOrWhiteSpace(tenantId)) return false;
        return _states.TryGetValue(tenantId, out var state) && state.IsLockedForMigration;
    }

    public TenantMigrationState? GetState(string tenantId)
    {
        if (string.IsNullOrWhiteSpace(tenantId)) return null;
        return _states.TryGetValue(tenantId, out var state) ? state : null;
    }

    public void SetState(TenantMigrationState state)
    {
        if (string.IsNullOrWhiteSpace(state.TenantId)) return;
        state.UpdatedAtUtc = DateTime.UtcNow;
        _states[state.TenantId] = state;
    }

    public void ClearState(string tenantId)
    {
        if (string.IsNullOrWhiteSpace(tenantId)) return;
        _states.TryRemove(tenantId, out _);
    }
}
