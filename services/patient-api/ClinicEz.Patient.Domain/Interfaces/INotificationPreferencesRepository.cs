using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Interfaces;

public interface INotificationPreferencesRepository : IBaseRepository<NotificationPreferences>
{
    Task<IReadOnlyList<NotificationPreferences>> GetByPatientAsync(Guid patientId, CancellationToken ct = default);
    Task<NotificationPreferences?> GetByPatientAndCategoryAsync(Guid patientId, NotificationCategory category, CancellationToken ct = default);
}
