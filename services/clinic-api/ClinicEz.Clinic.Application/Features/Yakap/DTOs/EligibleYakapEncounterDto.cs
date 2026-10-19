using System;

namespace ClinicEz.Clinic.Application.Features.Yakap.DTOs;

public record EligibleYakapEncounterDto(
    Guid EncounterId,
    Guid PatientId,
    string PatientName,
    string? PhilHealthIdentificationNumber,
    DateTime EncounterDate,
    string DoctorName,
    string? PrimaryDiagnosis,
    int DiagnosesCount,
    int PrescriptionsCount,
    int DiagnosticsCount,
    bool IsYakapEligible,
    bool HasPhilHealthPin,
    decimal TotalMedicationAmount
);
