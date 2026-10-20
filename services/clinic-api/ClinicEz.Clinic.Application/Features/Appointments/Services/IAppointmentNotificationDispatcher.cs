using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Appointments.Services;

public interface IAppointmentNotificationDispatcher
{
    Task DispatchAlertAsync(Appointment appointment, string alertKind, CancellationToken ct = default);
    Task DispatchStaffNotificationAsync(Appointment appointment, string eventType, CancellationToken ct = default);
}
