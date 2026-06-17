using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Appointments.Queries.GetClinicAppointments;

public sealed record GetClinicAppointmentsQuery(
    Guid PatientId,
    string ClinicBaseUrl,
    string BearerToken) : IRequest<ClinicAppointmentsResponse>;
