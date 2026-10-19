using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public sealed class DeviceSessionRepository : BaseRepository<DeviceSession>, IDeviceSessionRepository
{
    public DeviceSessionRepository(ApplicationDbContext context) : base(context) { }

    public async Task<IReadOnlyList<DeviceSession>> GetActiveByPatientIdAsync(
        Guid patientId,
        CancellationToken cancellationToken = default)
        => await DbSet
            .Where(d => d.PatientId == patientId && !d.IsRevoked)
            .OrderByDescending(d => d.LastActiveAt)
            .ToListAsync(cancellationToken);

    public Task<DeviceSession?> GetActiveByDeviceAsync(
        Guid patientId,
        string deviceId,
        CancellationToken cancellationToken = default)
        => DbSet
            .FirstOrDefaultAsync(
                d => d.PatientId == patientId && d.DeviceId == deviceId && !d.IsRevoked,
                cancellationToken);

    public Task<DeviceSession?> GetActiveByIdAsync(
        Guid patientId,
        Guid sessionId,
        CancellationToken cancellationToken = default)
        => DbSet
            .FirstOrDefaultAsync(
                d => d.Id == sessionId && d.PatientId == patientId && !d.IsRevoked,
                cancellationToken);

    public async Task<IReadOnlyList<DeviceSession>> RevokeAllForPatientAsync(
        Guid patientId,
        CancellationToken cancellationToken = default)
    {
        var activeSessions = await DbSet
            .Where(d => d.PatientId == patientId && !d.IsRevoked)
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;
        foreach (var session in activeSessions)
            session.Revoke(now);

        return activeSessions;
    }
}
