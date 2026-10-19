using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Features.Procedures.DTOs;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.Dental.DTOs;

/// <summary>
/// Data transfer object representing a single tooth record within the patient's dental chart.
/// </summary>
public sealed record DentalToothRecordDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    Guid PatientId,
    Guid? ConsultationId,
    int ToothNumber,
    ToothStatus Status,
    string? Surface,
    string? Notes,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    string? PatientName = null
);

/// <summary>
/// Pre-computed odontogram status summary metrics.
/// </summary>
public sealed record DentalSummaryDto(
    int TotalTeethRecorded,
    int HealthyCount,
    int DecayCount,
    int FilledCount,
    int MissingCount,
    int CrownCount,
    int ExtractionCount
);

/// <summary>
/// Input item for batch saving or updating tooth records.
/// </summary>
public sealed record ToothRecordInput(
    int ToothNumber,
    ToothStatus Status,
    string? Surface = null,
    string? Notes = null
);

/// <summary>
/// Complete patient dental chart including tooth records, dental procedures, and summary counts.
/// </summary>
public sealed record DentalChartDto(
    Guid PatientId,
    IReadOnlyList<DentalToothRecordDto> Teeth,
    IReadOnlyList<ClinicalProcedureDto> DentalProcedures,
    DateTime? LastExaminedAt,
    DentalSummaryDto? Summary = null
);
