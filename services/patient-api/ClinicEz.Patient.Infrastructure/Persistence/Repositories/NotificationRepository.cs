using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public sealed class NotificationRepository : BaseRepository<Notification>, INotificationRepository
{
    public NotificationRepository(ApplicationDbContext context) : base(context) { }

    public async Task<IReadOnlyList<Notification>> GetByPatientAsync(
        Guid patientId,
        bool unreadOnly,
        int skip,
        int take,
        CancellationToken cancellationToken = default)
        => await DbSet
            .Where(n => n.PatientId == patientId && (!unreadOnly || !n.IsRead))
            .OrderByDescending(n => n.CreatedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);

    public Task<int> GetUnreadCountAsync(Guid patientId, CancellationToken cancellationToken = default)
        => DbSet.CountAsync(n => n.PatientId == patientId && !n.IsRead, cancellationToken);

    public async Task MarkAllReadAsync(Guid patientId, CancellationToken cancellationToken = default)
    {
        var unread = await DbSet
            .Where(n => n.PatientId == patientId && !n.IsRead)
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;
        foreach (var n in unread)
        {
            n.IsRead = true;
            n.ReadAt = now;
        }
    }
}
