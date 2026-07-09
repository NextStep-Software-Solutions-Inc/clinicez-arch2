using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Enums;

namespace PatientAppBE.Domain.Interfaces;

public interface INotificationPreferencesRepository : IBaseRepository<NotificationPreferences>
{
    Task<IReadOnlyList<NotificationPreferences>> GetByPatientAsync(Guid patientId, CancellationToken ct = default);
    Task<NotificationPreferences?> GetByPatientAndCategoryAsync(Guid patientId, NotificationCategory category, CancellationToken ct = default);
}
