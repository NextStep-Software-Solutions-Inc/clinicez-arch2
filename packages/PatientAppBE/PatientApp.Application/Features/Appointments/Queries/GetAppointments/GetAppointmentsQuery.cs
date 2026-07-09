using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Appointments.Queries.GetAppointments;

public sealed record GetAppointmentsQuery(
    Guid PatientId) : IRequest<AppointmentsResponse>;
