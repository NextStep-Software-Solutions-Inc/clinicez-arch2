using System;
using System.Collections.Generic;
using System.Linq;

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
    List<CensusItemDto> Items,
    IReadOnlyList<CensusDispensingLedgerItemDto>? DispensingLedger = null,
    IReadOnlyList<CensusServiceBreakdownDto>? ServiceBreakdown = null,
    IReadOnlyList<CensusRosBreakdownDto>? RosBreakdown = null
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
    int EmergencyAcuityCount = 0,
    int VisitsWithMedicineDispensing = 0,
    int TotalDispensedLineItems = 0,
    int TotalDispensedUnits = 0,
    int PrescriptionsIssued = 0,
    int MedicalCertificatesIssued = 0,
    int ReferralsIssued = 0,
    int LabRequisitionsIssued = 0,
    int VitalsCheckVisits = 0,
    int InClinicProceduresCount = 0
);

public sealed record CensusServiceBreakdownDto(
    string ServiceName,
    int VisitCount,
    int TotalVolume,
    double Percentage
);

public sealed record CensusRosBreakdownDto(
    string RosCategory,
    int VisitCount,
    int DispensingCount,
    double Percentage
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
    bool IsNewPatient,
    IReadOnlyList<string>? ServicesAvailed = null,
    string? ServicesAvailedSummary = null,
    string? RosCategory = null,
    string? DispensedMedicinesSummary = null,
    int PrescriptionsCount = 0,
    int MedicalCertificatesCount = 0,
    int ReferralsCount = 0,
    int LabRequisitionsCount = 0
);

public sealed record CensusDispensingLedgerItemDto(
    Guid Id,
    DateTime DispensedAt,
    Guid? QueueItemId,
    string QueueNumber,
    string PatientName,
    string VisitType,
    string Source,
    string ItemName,
    string ItemCategory,
    string? DosageOrSpec,
    string FormOrUnit,
    int QuantityDispensed,
    string? DirectionsOrInstructions,
    string RosCategory,
    string DispensedByStaffName,
    string DispensedByRole,
    bool RequiresDoctorReview,
    bool IsReviewedByDoctor,
    string? ReviewedByDoctorName,
    bool InterventionFlagged
);

public static class ClinicCensusBreakdownResolver
{
    public static IReadOnlyList<CensusServiceBreakdownDto> ResolveServiceBreakdown(ClinicCensusReportDto report)
    {
        if (report.ServiceBreakdown is { Count: > 0 })
        {
            return report.ServiceBreakdown;
        }

        var items = report.Items ?? new List<CensusItemDto>();
        int total = report.Summary.TotalCensus > 0 ? report.Summary.TotalCensus : items.Count;
        double Pct(int visits) => total > 0 ? Math.Round(((double)visits / total) * 100.0, 1) : 0.0;

        bool HasService(CensusItemDto item, string svc) =>
            (item.ServicesAvailed != null && item.ServicesAvailed.Any(s => s.Equals(svc, StringComparison.OrdinalIgnoreCase))) ||
            (!string.IsNullOrWhiteSpace(item.ServicesAvailedSummary) && item.ServicesAvailedSummary.Contains(svc, StringComparison.OrdinalIgnoreCase));

        int consultVisits = items.Count > 0
            ? items.Count(i => HasService(i, "Consultation") || i.VisitType.Equals("Consultation", StringComparison.OrdinalIgnoreCase))
            : report.Summary.Consultations;

        int vitalsCheckVisits = items.Count > 0
            ? items.Count(i => HasService(i, "Vitals Check") || i.VisitType.Equals("VitalsCheckOnly", StringComparison.OrdinalIgnoreCase))
            : report.Summary.VitalsCheckVisits;

        int dispensingVisits = report.Summary.VisitsWithMedicineDispensing > 0
            ? report.Summary.VisitsWithMedicineDispensing
            : items.Count(i => HasService(i, "Medicine Dispensing") || !string.IsNullOrWhiteSpace(i.DispensedMedicinesSummary));
        int dispensingVolume = report.Summary.TotalDispensedLineItems > 0
            ? report.Summary.TotalDispensedLineItems
            : (report.DispensingLedger?.Count ?? dispensingVisits);

        int rxVisits = items.Count(i => i.PrescriptionsCount > 0 || HasService(i, "Prescription"));
        int rxVolume = report.Summary.PrescriptionsIssued > 0
            ? report.Summary.PrescriptionsIssued
            : items.Sum(i => i.PrescriptionsCount);
        if (rxVisits == 0 && rxVolume > 0) rxVisits = rxVolume;

        int medCertVisits = items.Count(i => i.MedicalCertificatesCount > 0 || HasService(i, "Medical Certificate"));
        int medCertVolume = report.Summary.MedicalCertificatesIssued > 0
            ? report.Summary.MedicalCertificatesIssued
            : items.Sum(i => i.MedicalCertificatesCount);
        if (medCertVisits == 0 && medCertVolume > 0) medCertVisits = medCertVolume;

        int referralVisits = items.Count(i => i.ReferralsCount > 0 || HasService(i, "Referral"));
        int referralVolume = report.Summary.ReferralsIssued > 0
            ? report.Summary.ReferralsIssued
            : items.Sum(i => i.ReferralsCount);
        if (referralVisits == 0 && referralVolume > 0) referralVisits = referralVolume;

        int labVisits = items.Count(i => i.LabRequisitionsCount > 0 || HasService(i, "Laboratory Requisition"));
        int labVolume = report.Summary.LabRequisitionsIssued > 0
            ? report.Summary.LabRequisitionsIssued
            : items.Sum(i => i.LabRequisitionsCount);
        if (labVisits == 0 && labVolume > 0) labVisits = labVolume;

        int procVisits = items.Count > 0
            ? items.Count(i => HasService(i, "In-Clinic Procedure") ||
                               i.VisitType.Equals("StandaloneProcedure", StringComparison.OrdinalIgnoreCase) ||
                               (!string.IsNullOrWhiteSpace(i.ProceduresPerformed) && !i.ProceduresPerformed.Equals("None", StringComparison.OrdinalIgnoreCase)))
            : (report.Summary.InClinicProceduresCount > 0 ? report.Summary.InClinicProceduresCount : report.Summary.StandaloneProcedures);
        int procVolume = report.Summary.InClinicProceduresCount > 0 ? report.Summary.InClinicProceduresCount : procVisits;

        return new List<CensusServiceBreakdownDto>
        {
            new("Consultation", consultVisits, consultVisits, Pct(consultVisits)),
            new("Vitals Check", vitalsCheckVisits, vitalsCheckVisits, Pct(vitalsCheckVisits)),
            new("Medicine Dispensing", dispensingVisits, dispensingVolume, Pct(dispensingVisits)),
            new("Prescription", rxVisits, rxVolume, Pct(rxVisits)),
            new("Medical Certificate", medCertVisits, medCertVolume, Pct(medCertVisits)),
            new("Referral", referralVisits, referralVolume, Pct(referralVisits)),
            new("Laboratory Requisition", labVisits, labVolume, Pct(labVisits)),
            new("In-Clinic Procedure", procVisits, procVolume, Pct(procVisits))
        };
    }

    public static IReadOnlyList<CensusRosBreakdownDto> ResolveRosBreakdown(ClinicCensusReportDto report)
    {
        if (report.RosBreakdown != null)
        {
            return report.RosBreakdown;
        }

        var items = report.Items ?? new List<CensusItemDto>();
        var ledger = report.DispensingLedger ?? Array.Empty<CensusDispensingLedgerItemDto>();
        int total = report.Summary.TotalCensus > 0 ? report.Summary.TotalCensus : items.Count;

        var visitCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var dispCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var canonicalNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in items)
        {
            if (!string.IsNullOrWhiteSpace(item.RosCategory))
            {
                var cat = item.RosCategory.Trim();
                canonicalNames.TryAdd(cat, cat);
                visitCounts[cat] = visitCounts.GetValueOrDefault(cat) + 1;
            }
        }

        foreach (var entry in ledger)
        {
            if (!string.IsNullOrWhiteSpace(entry.RosCategory))
            {
                var cat = entry.RosCategory.Trim();
                canonicalNames.TryAdd(cat, cat);
                dispCounts[cat] = dispCounts.GetValueOrDefault(cat) + 1;
            }
        }

        return canonicalNames.Keys
            .Select(key =>
            {
                int vCount = visitCounts.GetValueOrDefault(key);
                int dCount = dispCounts.GetValueOrDefault(key);
                double pct = total > 0 ? Math.Round(((double)vCount / total) * 100.0, 1) : 0.0;
                return new CensusRosBreakdownDto(canonicalNames[key], vCount, dCount, pct);
            })
            .OrderByDescending(x => x.VisitCount)
            .ThenByDescending(x => x.DispensingCount)
            .ThenBy(x => x.RosCategory, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
