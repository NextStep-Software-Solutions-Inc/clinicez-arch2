using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Appointments.Commands.PushClinicAppointments;

public sealed record PushClinicAppointmentsCommand(
    Guid PatientId,
    Guid ClinicId,
    IReadOnlyList<ClinicAppointmentDto> Appointments) : IRequest<bool>;
