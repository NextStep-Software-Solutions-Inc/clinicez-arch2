using ClinicEz.Comms.Domain.Entities;

namespace ClinicEz.Comms.Application.Common.Interfaces;

public interface ITenantMigrationGate
{
    bool IsTenantLocked(string tenantId);
    TenantMigrationState? GetState(string tenantId);
    void SetState(TenantMigrationState state);
    void ClearState(string tenantId);
}
