using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record MedicalHistoryEntryDto(
    string ConditionTitle,
    string? PhilHealthMdiseaseCode = null,
    string? Icd10Code = null,
    string? SpecificDescription = null,
    DateOnly? OnsetDate = null,
    bool IsResolved = false,
    string? ClinicalNotes = null,
    Guid? Id = null);

public sealed record ClinicPatientDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    string PatientCode,
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Suffix,
    string FullName,
    DateOnly DateOfBirth,
    int Age,
    string Gender,
    string? CivilStatus,
    string ContactNumber,
    string? Email,
    string? AddressLine,
    string? Barangay,
    string? City,
    string? Province,
    string? EmergencyContactName,
    string? EmergencyContactPhone,
    string? EmergencyContactRelationship,
    string? PhilHealthNumber,
    string? SeniorCitizenId,
    string? PwdId,
    string? BloodType,
    string? Allergies,
    string? ChronicConditions,
    string? Alerts,
    Guid? SyncPatientId,
    DateTime CreatedAt,
    System.Collections.Generic.Dictionary<string, object?>? CustomFields = null,
    string VerificationStatus = "Verified",
    string? ActiveQueueTicket = null,
    Guid? ActiveQueueItemId = null,
    List<PatientPastMedicalHistoryDto>? PastMedicalHistories = null,
    string? ClinicEzId = null);
