using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

/// <summary>
/// Seam for resolving tenant-specific and replica connection strings for high-scale multi-tenant operations.
/// </summary>
public interface ITenantConnectionResolver
{
    string GetConnectionString(string tenantId);
    string GetReadReplicaConnectionString(string tenantId);
    Task<string> GetConnectionStringAsync(string tenantId, CancellationToken cancellationToken = default);
    Task<string> GetReadReplicaConnectionStringAsync(string tenantId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Default implementation of ITenantConnectionResolver using primary connection configuration.
/// </summary>
public class DefaultTenantConnectionResolver : ITenantConnectionResolver
{
    private readonly string _defaultConnection;

    public DefaultTenantConnectionResolver(IConfiguration configuration)
    {
        _defaultConnection = configuration.GetConnectionString("DefaultConnection") 
            ?? configuration.GetConnectionString("Default") 
            ?? string.Empty;
    }

    public string GetConnectionString(string tenantId) => _defaultConnection;
    public string GetReadReplicaConnectionString(string tenantId) => _defaultConnection;
    public Task<string> GetConnectionStringAsync(string tenantId, CancellationToken cancellationToken = default) => Task.FromResult(_defaultConnection);
    public Task<string> GetReadReplicaConnectionStringAsync(string tenantId, CancellationToken cancellationToken = default) => Task.FromResult(_defaultConnection);
}
