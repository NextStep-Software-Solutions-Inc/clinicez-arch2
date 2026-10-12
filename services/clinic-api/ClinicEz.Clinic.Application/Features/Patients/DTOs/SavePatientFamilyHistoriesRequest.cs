using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record FamilyHistoryEntryItem(
    string ConditionTitle,
    string? PhilHealthMdiseaseCode = null,
    string? Icd10Code = null,
    string? SpecificDescription = null,
    string? Relationship = null,
    string? ClinicalNotes = null);

public sealed record SavePatientFamilyHistoriesRequest(
    List<FamilyHistoryEntryItem> Items,
    string? Notes = null);

public sealed record PatientFamilyHistoryResultDto(
    List<PatientFamilyHistoryDto> Items,
    string? FamilyMedicalHistoryNotes);
