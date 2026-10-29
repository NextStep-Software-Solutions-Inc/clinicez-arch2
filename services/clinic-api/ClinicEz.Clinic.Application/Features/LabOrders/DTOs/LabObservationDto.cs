using System;

namespace ClinicEz.Clinic.Application.Features.LabOrders.DTOs;

public sealed record LabObservationDto(
    Guid? Id,
    Guid LabOrderId,
    Guid? LabOrderItemId,
    string? LoincCode,
    string AnalyteCode,
    string AnalyteName,
    string ValueText,
    decimal? NumericValue = null,
    string? Unit = null,
    decimal? ReferenceRangeLow = null,
    decimal? ReferenceRangeHigh = null,
    string? AbnormalFlag = null,
    bool IsCriticalPanic = false
);
