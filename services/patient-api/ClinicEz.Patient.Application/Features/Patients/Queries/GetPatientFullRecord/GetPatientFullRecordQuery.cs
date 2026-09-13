using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientFullRecord;

public sealed record GetPatientFullRecordQuery(Guid PatientId) : IRequest<PatientFullRecordDto>;
