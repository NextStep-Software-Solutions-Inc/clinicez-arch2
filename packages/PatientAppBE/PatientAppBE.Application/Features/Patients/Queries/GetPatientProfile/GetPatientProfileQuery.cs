using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.Patients.Queries.GetPatientProfile;

public sealed record GetPatientProfileQuery(Guid PatientId) : IRequest<PatientProfileDto>;
