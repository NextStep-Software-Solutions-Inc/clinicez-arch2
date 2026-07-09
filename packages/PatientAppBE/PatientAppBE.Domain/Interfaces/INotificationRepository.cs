using PatientAppBE.Domain.Entities;

namespace PatientAppBE.Domain.Interfaces;

public interface INotificationRepository : IBaseRepository<Notification>
{
    Task<IReadOnlyList<Notification>> GetByPatientAsync(
        Guid patientId,
        bool unreadOnly,
        int skip,
        int take,
        CancellationToken cancellationToken = default);

    Task<int> GetUnreadCountAsync(
        Guid patientId,
        CancellationToken cancellationToken = default);

    Task MarkAllReadAsync(
        Guid patientId,
        CancellationToken cancellationToken = default);
}
