using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.Appointments.Commands.PushClinicAppointments;

public sealed record PushClinicAppointmentsCommand(
    Guid PatientId,
    Guid ClinicId,
    IReadOnlyList<ClinicAppointmentDto> Appointments) : IRequest<bool>;
