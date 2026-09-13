using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Interfaces;

public interface ITenantFeatureGuard
{
    Task EnsureCanCreateClinicAsync(string tenantId, CancellationToken cancellationToken = default);
    Task EnsureCanCreateStaffAsync(string tenantId, CancellationToken cancellationToken = default);
    Task EnsureCanCreatePatientAsync(string tenantId, CancellationToken cancellationToken = default);
}
