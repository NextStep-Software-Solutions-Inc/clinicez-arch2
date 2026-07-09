using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.Appointments.Queries.GetAppointments;

public sealed record GetAppointmentsQuery(
    Guid PatientId) : IRequest<AppointmentsResponse>;
