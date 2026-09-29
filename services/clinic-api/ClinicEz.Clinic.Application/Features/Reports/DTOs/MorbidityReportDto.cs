using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Reports.DTOs;

public record MorbidityDiseaseRowDto(
    int Rank,
    string Icd10Code,
    string Description,
    int TotalCases,
    int PediatricCases, // 0 - 17 years old
    int AdultCases,     // 18 - 59 years old
    int SeniorCases,    // 60+ years old
    int MaleCases,
    int FemaleCases,
    double PercentageOfTotal
);

public record MorbidityReportDto(
    DateTime StartDate,
    DateTime EndDate,
    string TenantId,
    Guid ClinicId,
    string ClinicName,
    int TotalEncountersReviewed,
    int TotalDiagnosesRecorded,
    List<MorbidityDiseaseRowDto> Diseases
);
