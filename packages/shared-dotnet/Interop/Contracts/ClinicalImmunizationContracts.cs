using System;

namespace ClinicEz.Shared.Interop.Contracts;

public sealed record ClinicalImmunizationAdministeredPayload(
    Guid ImmunizationId,
    Guid PatientId,
    Guid ClinicId,
    string PhilHealthLibrary,
    string PhilHealthCode,
    string VaccineName,
    string? BrandName,
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
    bool IsHistorical = false,
    string? HistoricalFacilityName = null
);
