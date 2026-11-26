using System.Collections.Generic;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientByClerkId;

public sealed record GetPatientByClerkIdQuery(
    string ClerkUserId,
    IReadOnlyList<string>? VerifiedEmails = null) : IRequest<PatientSummaryDto?>;
