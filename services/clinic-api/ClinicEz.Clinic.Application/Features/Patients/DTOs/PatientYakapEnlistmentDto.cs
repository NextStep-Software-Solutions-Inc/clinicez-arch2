using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientYakapEnlistmentDto(
    Guid? Id,
    int EffectiveYear,
    string Status,
    string Source,
    string PackageType,
    DateOnly EnlistmentDate,
    DateOnly ValidUntil,
    string? CaseNo = null,
    string? EnlistmentTransNo = null,
    string? ProfilingTransNo = null,
    DateOnly? ProfilingDate = null,
    string? ProfilingAtc = null,
    bool IsWalkedIn = false,
    bool HasPatientConsent = true,
    DateTime? ConsentSignedAtUtc = null,
    Guid? CreatedByStaffId = null,
    string? CreatedByStaffName = null,
    DateOnly? EnlistmentTransDate = null
);
