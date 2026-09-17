using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;

namespace ClinicEz.Portal.Application.Interfaces;

public interface ITenantFeatureGuard
{
    Task EnsureCanCreateClinicAsync(string tenantId, CancellationToken cancellationToken = default);
    Task EnsureCanCreateFacilityAsync(string tenantId, FacilityType facilityType, CancellationToken cancellationToken = default);
    Task EnsureCanCreateStaffAsync(string tenantId, CancellationToken cancellationToken = default);
    Task EnsureCanCreatePatientAsync(string tenantId, CancellationToken cancellationToken = default);
}
