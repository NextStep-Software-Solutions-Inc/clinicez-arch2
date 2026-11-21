using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.MediaBroker.Application.Common.Interfaces;

public interface IMediaBrokerDbContext
{
    DbSet<TenantMediaEntitlement> Entitlements { get; }
    DbSet<MediaCallSession> CallSessions { get; }
    DbSet<TenantMonthlyUsage> MonthlyUsages { get; }
    DbSet<MediaAuditLog> AuditLogs { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
