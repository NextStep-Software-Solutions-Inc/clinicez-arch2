using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record MedicalHistoryEntryItem(
    string ConditionTitle,
    string? PhilHealthMdiseaseCode = null,
    string? Icd10Code = null,
    string? SpecificDescription = null,
    DateOnly? OnsetDate = null,
    bool IsResolved = false,
    string? ClinicalNotes = null);

public sealed record SavePatientMedicalHistoriesRequest(
    List<MedicalHistoryEntryItem> Items,
    string? Notes = null);

public sealed record PatientMedicalHistoryResultDto(
    List<PatientPastMedicalHistoryDto> Items,
    string? PersonalMedicalHistoryNotes);
