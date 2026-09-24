using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.DTOs;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IPatientWebhookNotifier
{
    Task<bool> PushAppointmentUpdateAsync(ClinicPushAppointmentsPayload payload, CancellationToken cancellationToken = default);
}
