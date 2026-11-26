using System.Collections.Generic;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientMe;

public sealed record GetPatientMeQuery(
    string ClerkUserId,
    IReadOnlyList<string>? VerifiedEmails = null) : IRequest<PatientMeDto?>;
