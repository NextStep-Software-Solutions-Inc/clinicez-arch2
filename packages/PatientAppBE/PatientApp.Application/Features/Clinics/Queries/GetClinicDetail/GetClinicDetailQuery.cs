using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Clinics.Queries.GetClinicDetail;

public sealed record GetClinicDetailQuery(Guid ClinicId, Guid? ForPatientId = null)
    : IRequest<ClinicDetailDto?>;
