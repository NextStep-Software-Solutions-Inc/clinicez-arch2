using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.DTOs;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// Tells the patient app about an appointment state change (<c>clinic.appointment.updated</c>, addressed to the patient
/// through the interop hub). The message is queued in the transactional outbox: call it BEFORE the business
/// <c>SaveChanges</c> so both commit atomically. Returns false (nothing queued) when the clinic patient is not linked
/// to a patient-app account.
/// </summary>
public interface IPatientAppointmentPublisher
{
    Task<bool> PublishAppointmentUpdatedAsync(ClinicPushAppointmentsPayload payload, CancellationToken cancellationToken = default);
}
