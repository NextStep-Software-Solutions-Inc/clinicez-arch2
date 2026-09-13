using Microsoft.EntityFrameworkCore;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Interfaces;
using PatientAppBE.Infrastructure.Persistence;

namespace PatientAppBE.Infrastructure.Persistence.Repositories;

public sealed class DeviceSessionRepository : BaseRepository<DeviceSession>, IDeviceSessionRepository
{
    public DeviceSessionRepository(ApplicationDbContext context) : base(context) { }

    public Task<DeviceSession?> GetActiveByPatientIdAsync(
        Guid patientId,
        CancellationToken cancellationToken = default)
        => DbSet
            .FirstOrDefaultAsync(d => d.PatientId == patientId && !d.IsRevoked, cancellationToken);

    public async Task RevokeAllForPatientAsync(
        Guid patientId,
        string revokedBy,
        CancellationToken cancellationToken = default)
    {
        var activeSessions = await DbSet
            .Where(d => d.PatientId == patientId && !d.IsRevoked)
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;
        foreach (var session in activeSessions)
        {
            session.IsRevoked = true;
            session.RevokedAt = now;
            session.UpdatedBy = revokedBy;
        }
    }
}
