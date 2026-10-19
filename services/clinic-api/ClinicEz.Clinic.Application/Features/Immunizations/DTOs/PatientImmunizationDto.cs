using System;

namespace ClinicEz.Clinic.Application.Features.Immunizations.DTOs;

public sealed record PatientImmunizationDto(
    Guid Id,
    Guid PatientId,
    string PatientName,
    Guid? ConsultationEncounterId,
    string PhilHealthLibrary,
    string PhilHealthCode,
    string VaccineName,
    string? BrandName,
    string? Manufacturer,
    string LotBatchNumber,
    DateOnly ExpirationDate,
    int DoseSequence,
    bool IsSeriesCompleted,
    string Route,
    string InjectionSite,
    DateTime AdministeredAtUtc,
    Guid AdministeredByStaffId,
    string AdministeredByStaffName,
    string? AdministeredByPrcLicense,
    bool HasAdverseReaction,
    string AdverseReactionSeverity,
    string? AdverseReactionRemarks,
    DateTime? AdverseReactionRecordedAtUtc,
    bool IsHistorical,
    string? HistoricalFacilityName,
    string? Remarks,
    bool IsSynchronizedToPatientApp,
    DateTime? SynchronizedAtUtc
);
