using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record DuplicateMatchDto(
    Guid PatientId,
    string PatientCode,
    string FullName,
    DateOnly DateOfBirth,
    string? ContactNumber,
    string? PhilHealthNumber,
    string MatchReason
);

public sealed record DuplicatePatientCheckResultDto(
    bool HasDuplicates,
    IReadOnlyList<DuplicateMatchDto> Matches
);
