using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Appointments.Commands.PushClinicAppointments;

public sealed record PushClinicAppointmentsCommand(
    Guid PatientId,
    Guid ClinicId,
    IReadOnlyList<ClinicAppointmentDto> Appointments) : IRequest<bool>;
