using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.Clinics.Queries.GetClinicDetail;

public sealed record GetClinicDetailQuery(Guid ClinicId, Guid? ForPatientId = null)
    : IRequest<ClinicDetailDto?>;
