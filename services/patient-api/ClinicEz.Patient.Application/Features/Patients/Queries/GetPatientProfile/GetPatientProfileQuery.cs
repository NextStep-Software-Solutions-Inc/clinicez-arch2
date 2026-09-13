using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientProfile;

public sealed record GetPatientProfileQuery(Guid PatientId) : IRequest<PatientProfileDto>;
