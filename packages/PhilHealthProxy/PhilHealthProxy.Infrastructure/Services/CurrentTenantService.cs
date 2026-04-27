using PhilHealthProxy.Domain.Interfaces;

namespace PhilHealthProxy.Infrastructure.Services;

/// <summary>
/// Scoped service that holds the resolved tenant identifier for the current HTTP request.
/// The <c>TenantResolutionMiddleware</c> calls <see cref="SetTenantId"/> once per request.
/// </summary>
public sealed class CurrentTenantService : ICurrentTenant
{
    public Guid? TenantId { get; private set; }

    public void SetTenantId(Guid tenantId) => TenantId = tenantId;
}
