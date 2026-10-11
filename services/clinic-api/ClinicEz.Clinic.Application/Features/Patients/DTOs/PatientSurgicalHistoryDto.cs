using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientSurgicalHistoryDto(
    Guid Id,
    Guid PatientId,
    string ProcedureName,
    DateOnly SurgeryDate,
    string? HospitalName,
    string? Findings,
    string? Complications,
    string? Remarks);

public sealed record UpsertPatientSurgicalHistoryRequest(
    string ProcedureName,
    DateOnly SurgeryDate,
    string? HospitalName = null,
    string? Findings = null,
    string? Complications = null,
    string? Remarks = null);
