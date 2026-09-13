using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Clinics.Queries.GetClinicDetail;

public sealed record GetClinicDetailQuery(Guid ClinicId, Guid? ForPatientId = null)
    : IRequest<ClinicDetailDto?>;
