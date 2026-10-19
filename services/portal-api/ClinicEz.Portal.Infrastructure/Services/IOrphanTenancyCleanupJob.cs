using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Infrastructure.Services;

public interface IOrphanTenancyCleanupJob
{
    /// <summary>
    /// Scans for orphaned workspaces based on platform settings.
    /// If auto-purge is enabled, permanently purges zero-data ghost workspaces older than the grace period.
    /// If auto-purge is disabled, logs summary telemetry of identified candidates.
    /// </summary>
    Task<int> ProcessOrphanTenanciesAsync(CancellationToken cancellationToken);
}
