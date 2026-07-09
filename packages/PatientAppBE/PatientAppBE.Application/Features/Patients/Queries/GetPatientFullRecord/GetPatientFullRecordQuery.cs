using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.Patients.Queries.GetPatientFullRecord;

public sealed record GetPatientFullRecordQuery(Guid PatientId) : IRequest<PatientFullRecordDto>;
