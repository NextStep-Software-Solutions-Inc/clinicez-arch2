using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record CurrentYearFpeStatusDto(
    int EffectiveYear,
    bool HasActiveEnlistment,
    Guid? EnlistmentId,
    bool IsCompleted,
    DateOnly? ProfilingDate = null,
    string? ProfilingTransNo = null,
    string? ProfilingAtc = null
);

public sealed record PatientPhilHealthCoverageDto(
    Guid PatientId,
    string? PhilHealthNumber,
    PatientPhilHealthMembershipDto? Membership,
    List<PatientYakapEnlistmentDto> Enlistments,
    CurrentYearFpeStatusDto CurrentYearFpeStatus
);
