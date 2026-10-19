using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Reports.DTOs;

public record FlowAnalyticsDto(
    int TotalEncountersToday,
    int InQueueNow,
    int UrgentTriageNow,
    int InConsultationNow,
    int CompletedToday,
    double AverageWaitMinutes,
    double AverageConsultMinutes,
    int RoutineCount,
    int UrgentCount,
    int EmergencyCount
);

public record DailyTrendPointDto(
    string DateLabel,
    decimal Revenue,
    int PatientCount
);

public record TenderShareDto(
    string Method,
    decimal TotalAmount,
    double Percentage
);

public record MorbidityItemDto(
    string Icd10Code,
    string Description,
    int CaseCount,
    double PercentageShare
);

public record ServiceUsageDto(
    string ItemType, // "Procedure" or "LabOrder"
    string ItemName,
    int Quantity
);

public record DoctorStatDto(
    string DoctorName,
    int EncountersCount,
    decimal TotalBilled
);

public record ClinicAnalyticsDto(
    DateTime StartDate,
    DateTime EndDate,
    string TenantId,
    Guid ClinicId,
    FlowAnalyticsDto Flow,
    decimal TotalGrossRevenue,
    decimal TotalNetRevenue,
    decimal TotalCollections,
    decimal TotalUnpaidBalances,
    decimal AverageTicketSize,
    decimal SeniorDiscountsGiven,
    decimal PwdDiscountsGiven,
    List<DailyTrendPointDto> RevenueTrend,
    List<TenderShareDto> TenderShares,
    List<MorbidityItemDto> TopDiagnoses,
    List<ServiceUsageDto> TopServices,
    List<DoctorStatDto> DoctorStats
);
