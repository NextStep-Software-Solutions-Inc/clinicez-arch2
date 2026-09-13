using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public sealed class NotificationPreferencesRepository
    : BaseRepository<NotificationPreferences>, INotificationPreferencesRepository
{
    public NotificationPreferencesRepository(ApplicationDbContext context) : base(context) { }

    public async Task<IReadOnlyList<NotificationPreferences>> GetByPatientAsync(Guid patientId, CancellationToken ct = default)
        => await DbSet.Where(p => p.PatientId == patientId).ToListAsync(ct);

    public Task<NotificationPreferences?> GetByPatientAndCategoryAsync(Guid patientId, NotificationCategory category, CancellationToken ct = default)
        => DbSet.FirstOrDefaultAsync(p => p.PatientId == patientId && p.Category == category, ct);
}
