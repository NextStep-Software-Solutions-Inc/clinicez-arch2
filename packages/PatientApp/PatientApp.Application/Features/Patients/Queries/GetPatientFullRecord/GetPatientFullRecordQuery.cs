using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Patients.Queries.GetPatientFullRecord;

public sealed record GetPatientFullRecordQuery(Guid PatientId) : IRequest<PatientFullRecordDto>;
