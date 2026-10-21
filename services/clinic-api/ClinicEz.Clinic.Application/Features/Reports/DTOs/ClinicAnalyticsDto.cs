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

public record HourlyFlowPointDto(
    int Hour,
    string HourLabel,
    int CheckInCount,
    double Percentage
);

public record VisitTypeSplitDto(
    int WalkInCount,
    double WalkInPercentage,
    int AppointmentCount,
    double AppointmentPercentage
);

public record AcuitySplitDto(
    int RoutineCount,
    double RoutinePercentage,
    int UrgentCount,
    double UrgentPercentage,
    int EmergencyCount,
    double EmergencyPercentage
);

public record DemographicDistributionDto(
    int PediatricCount,
    double PediatricPercentage,
    int AdultCount,
    double AdultPercentage,
    int SeniorCount,
    double SeniorPercentage,
    int MaleCount,
    double MalePercentage,
    int FemaleCount,
    double FemalePercentage,
    int OtherCount,
    double OtherPercentage
);

public record FinancialEfficiencyDto(
    double CollectionEfficiencyRate,
    double DiscountImpactRate,
    decimal AverageRevenuePerPatient,
    decimal TotalDiscounts
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
    List<DoctorStatDto> DoctorStats,
    List<HourlyFlowPointDto>? HourlyFlow = null,
    VisitTypeSplitDto? VisitTypeSplit = null,
    AcuitySplitDto? AcuitySplit = null,
    DemographicDistributionDto? Demographics = null,
    FinancialEfficiencyDto? FinancialEfficiency = null
);
