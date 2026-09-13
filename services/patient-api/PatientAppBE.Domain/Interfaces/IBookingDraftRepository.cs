using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Enums;

namespace PatientAppBE.Domain.Interfaces;

public interface IBookingDraftRepository : IBaseRepository<BookingDraft>
{
    Task<IReadOnlyList<BookingDraft>> GetByPatientAsync(Guid patientId, BookingDraftStatus? status, CancellationToken ct = default);
}
