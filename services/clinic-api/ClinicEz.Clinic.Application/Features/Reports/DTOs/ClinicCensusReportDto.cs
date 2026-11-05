using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Reports.DTOs;

public sealed record ClinicCensusReportDto(
    DateTime StartDate,
    DateTime EndDate,
    string TenantId,
    Guid ClinicId,
    string? ClinicName,
    DateTime GeneratedAt,
    CensusSummaryDto Summary,
    CensusDemographicsBreakdownDto Demographics,
    CensusAcuityBreakdownDto Acuity,
    List<CensusVisitTypeBreakdownDto> VisitTypes,
    List<CensusProviderBreakdownDto> Providers,
    List<CensusItemDto> Items
);

public sealed record CensusSummaryDto(
    int TotalCensus,
    int NewPatients,
    int ReturningPatients,
    int Consultations,
    int StandaloneProcedures,
    int DiagnosticsOrLab,
    int NonDoctorVisits,
    int CompletedVisits,
    int InConsultationOrWaiting,
    int DivertedVisits,
    int CancelledOrNoShow,
    double AverageTurnaroundMinutes,
    int DistinctPatientsCount,
    int UrgentAcuityCount = 0,
    int EmergencyAcuityCount = 0
);

public sealed record CensusDemographicsBreakdownDto(
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
    int OtherGenderCount,
    double OtherGenderPercentage,
    int SeniorCitizenCount,
    int PwdCount,
    int PhilHealthCount
);

public sealed record CensusAcuityBreakdownDto(
    int RoutineCount,
    double RoutinePercentage,
    int UrgentCount,
    double UrgentPercentage,
    int EmergencyCount,
    double EmergencyPercentage
);

public sealed record CensusVisitTypeBreakdownDto(
    string VisitType,
    int Count,
    double Percentage
);

public sealed record CensusProviderBreakdownDto(
    string StaffName,
    string Role, // "Doctor" or "Nurse"
    int TotalEncounters,
    int CompletedEncounters
);

public sealed record CensusItemDto(
    int SequenceNumber,
    DateTime CheckInTime,
    DateTime? TriageTime,
    DateTime? CalledTime,
    DateTime? CompletedTime,
    int? TurnaroundMinutes,
    string QueueNumber,
    string PatientCode,
    string PatientName,
    int Age,
    string Sex,
    string CivilStatus,
    string Classification,
    Dictionary<string, object?> CustomFields,
    string CustomFieldsSummary,
    string VisitType,
    string? ChiefComplaint,
    string? NurseAssessment,
    string? AttendingNurse,
    string? VitalsSnapshot,
    string? AttendingDoctor,
    string? DoctorDiagnosis,
    string? ClinicalAssessment,
    string? SystemsReviewed,
    string? ProceduresPerformed,
    string Acuity,
    string Disposition,
    string BillingStatus,
    string? OfficialReceiptNumber,
    decimal AmountPaid,
    decimal GrossAmount,
    decimal NetAmount,
    decimal BalanceDue,
    bool IsNewPatient
);
