using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Interfaces;

public interface IBookingDraftRepository : IBaseRepository<BookingDraft>
{
    Task<IReadOnlyList<BookingDraft>> GetByPatientAsync(Guid patientId, BookingDraftStatus? status, CancellationToken ct = default);
}
