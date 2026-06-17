using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Patients.Queries.GetPatientProfile;

public sealed record GetPatientProfileQuery(Guid PatientId) : IRequest<PatientProfileDto>;
