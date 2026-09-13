namespace PhilHealthProxy.Domain.Interfaces;

/// <summary>Provides the resolved tenant identifier for the current request.</summary>
public interface ICurrentTenant
{
    Guid? TenantId { get; }
}
