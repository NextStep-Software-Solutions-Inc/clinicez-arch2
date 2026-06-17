using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Interfaces;

public interface IBookingDraftRepository : IBaseRepository<BookingDraft>
{
    Task<IReadOnlyList<BookingDraft>> GetByPatientAsync(Guid patientId, BookingDraftStatus? status, CancellationToken ct = default);
}
