using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.Patients.Queries.GetPatientByClerkId;

public sealed record GetPatientByClerkIdQuery(string ClerkUserId) : IRequest<PatientSummaryDto?>;
