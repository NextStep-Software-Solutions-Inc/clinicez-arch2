using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Patients.Queries.GetPatientByClerkId;

public sealed record GetPatientByClerkIdQuery(string ClerkUserId) : IRequest<PatientSummaryDto?>;
