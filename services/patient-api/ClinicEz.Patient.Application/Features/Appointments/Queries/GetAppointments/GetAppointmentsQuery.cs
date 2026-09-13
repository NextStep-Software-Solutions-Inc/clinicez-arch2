using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Appointments.Queries.GetAppointments;

public sealed record GetAppointmentsQuery(
    Guid PatientId) : IRequest<AppointmentsResponse>;
