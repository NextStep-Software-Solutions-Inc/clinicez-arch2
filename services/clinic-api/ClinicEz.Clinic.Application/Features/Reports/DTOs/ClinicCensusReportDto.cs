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
    IReadOnlyList<CensusRosBreakdownDto>? RosBreakdown = null,
    int PageNumber = 1,
    int PageSize = 0,
    int TotalItems = 0,
    int TotalPages = 1,
    bool HasPreviousPage = false,
    bool HasNextPage = false,
    IReadOnlyList<CensusServiceItemBreakdownDto>? ItemizedProcedures = null,
    IReadOnlyList<CensusServiceItemBreakdownDto>? ItemizedInClinicDiagnostics = null,
    IReadOnlyList<CensusServiceItemBreakdownDto>? ItemizedOutsideDiagnostics = null
);

public sealed record CensusServiceItemBreakdownDto(
    string ItemName,
    int Count
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
    int LabRequisitionsCount = 0,
    IReadOnlyList<CensusServiceRowDto>? ServiceRows = null,
    decimal TotalServiceFees = 0m,
    decimal ConsultationFee = 0m,
    decimal VitalsFee = 0m
);

public sealed record CensusServiceRowDto(
    int SubRowIndex,
    string ServiceName,
    DateTime? ServiceTime,
    string? ReferenceNumber,
    string? AttendingDoctor,
    string? AttendingNurse,
    string? ChiefComplaint,
    string? NurseAssessment,
    string? VitalsSnapshot,
    string? DoctorDiagnosis,
    string? ClinicalAssessment,
    string? RosCategory,
    string? SystemsReviewed,
    string? ServiceDetails,
    string? Acuity,
    string? Disposition,
    string? ServiceItemName = null,
    decimal ServiceFee = 0m
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
            ? items.Count(i => HasService(i, "Consultation") || VisitTypeExtensions.IsPhysicianConsultationString(i.VisitType))
            : report.Summary.Consultations;

        int vitalsCheckVisits = items.Count > 0
            ? items.Count(i => HasService(i, "Vitals Check") ||
                               HasService(i, "Preventive Health Assessment") ||
                               i.VisitType.Equals(nameof(VisitType.PreventiveHealthAssessment), StringComparison.OrdinalIgnoreCase))
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

    public static string FormatVisitTypeLabel(string? visitType) => (visitType ?? string.Empty).Trim() switch
    {
        nameof(VisitType.RoutineCheckup) or "Routine Checkup" => "Routine Checkup",
        nameof(VisitType.AcuteIllnessConsultation) or "Acute Illness Consultation" => "Acute Illness Consultation",
        nameof(VisitType.ChronicDiseaseFollowUp) or "Chronic Disease Follow-Up" => "Chronic Disease Follow-Up",
        nameof(VisitType.PreventiveHealthAssessment) or "Preventive Health Assessment" => "Preventive Health Assessment",
        nameof(VisitType.UrgentCareVisit) or "Urgent Care Visit" => "Urgent Care Visit",
        _ => string.Empty
    };

    public static string MapVisitTypeToPrimaryServiceLabel(string? visitType) => (visitType ?? string.Empty).Trim() switch
    {
        nameof(VisitType.RoutineCheckup) => "Routine Checkup",
        nameof(VisitType.AcuteIllnessConsultation) => "Acute Illness Consultation",
        nameof(VisitType.ChronicDiseaseFollowUp) => "Chronic Disease Follow-Up",
        nameof(VisitType.PreventiveHealthAssessment) => "Preventive Health Assessment",
        nameof(VisitType.UrgentCareVisit) => "Urgent Care Visit",
        "Consultation" => "Consultation",
        "VitalsCheckOnly" => "Vitals Check",
        var other => string.IsNullOrWhiteSpace(other) ? "Clinic Visit" : other
    };

    public static string NormalizeCensusDisplayValue(string? val, params string[] extraEmptySentinels)
    {
        if (string.IsNullOrWhiteSpace(val)) return string.Empty;
        var trimmed = val.Trim();
        if (trimmed is "—" or "-" ||
            trimmed.Equals("N/A", StringComparison.OrdinalIgnoreCase) ||
            trimmed.Equals("N/A - Non-doctor visit", StringComparison.OrdinalIgnoreCase) ||
            trimmed.Equals("Non-doctor visit", StringComparison.OrdinalIgnoreCase) ||
            trimmed.Equals("No vitals recorded", StringComparison.OrdinalIgnoreCase) ||
            trimmed.Equals("None recorded", StringComparison.OrdinalIgnoreCase) ||
            trimmed.Equals("None", StringComparison.OrdinalIgnoreCase))
        {
            return string.Empty;
        }

        foreach (var sentinel in extraEmptySentinels)
        {
            if (trimmed.Equals(sentinel, StringComparison.OrdinalIgnoreCase))
                return string.Empty;
        }

        return trimmed;
    }

    /// <summary>
    /// Resolves additional per-service sub-rows availed on top of the parent visit row.
    /// Keeps the parent visit row (with main attending MD &amp; RN, triage vitals, diagnosis, and billing) intact,
    /// and emits dedicated sub-rows for auxiliary services (dispensing, prescriptions, certificates, referrals,
    /// lab requisitions, and procedures performed on top of the base visit).
    /// </summary>
    public static IReadOnlyList<CensusServiceRowDto> ResolveAdditionalServiceRows(CensusItemDto item) =>
        ResolveServiceRows(item)
            .Where(r => !r.ServiceName.Equals("Vitals & Triage", StringComparison.OrdinalIgnoreCase) &&
                        !r.ServiceName.Equals("Doctor Consultation", StringComparison.OrdinalIgnoreCase))
            .ToList();

    public static IReadOnlyList<CensusServiceRowDto> ResolveServiceRows(CensusItemDto item)
    {
        if (item.ServiceRows != null)
        {
            return item.ServiceRows;
        }

        var primaryLabel = MapVisitTypeToPrimaryServiceLabel(item.VisitType);
        if (item.ServicesAvailed is not { Count: > 0 })
        {
            return Array.Empty<CensusServiceRowDto>();
        }

        var doc = NormalizeCensusDisplayValue(item.AttendingDoctor);
        var nurse = NormalizeCensusDisplayValue(item.AttendingNurse);
        var procs = NormalizeCensusDisplayValue(item.ProceduresPerformed);
        var dispensed = NormalizeCensusDisplayValue(item.DispensedMedicinesSummary);

        var rows = new List<CensusServiceRowDto>();
        int subIdx = 0;

        foreach (var svc in item.ServicesAvailed)
        {
            if (svc.Equals(primaryLabel, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            bool isProc = svc.Equals("In-Clinic Procedure", StringComparison.OrdinalIgnoreCase);
            bool isDisp = svc.Equals("Medicine Dispensing", StringComparison.OrdinalIgnoreCase);
            bool isReferral = svc.Equals("Referral", StringComparison.OrdinalIgnoreCase);

            string details = svc switch
            {
                _ when isProc => procs,
                _ when isDisp => !string.IsNullOrEmpty(dispensed) ? $"Dispensed: {dispensed}" : string.Empty,
                _ => string.Empty
            };

            string disposition = isDisp
                ? "Dispensed"
                : (isReferral ? "Referred" : (isProc ? "Completed" : "Issued"));

            rows.Add(new CensusServiceRowDto(
                SubRowIndex: subIdx++,
                ServiceName: svc,
                ServiceTime: item.CompletedTime ?? item.CalledTime ?? item.CheckInTime,
                ReferenceNumber: null,
                AttendingDoctor: isDisp && !VisitTypeExtensions.IsPhysicianConsultationString(item.VisitType) ? string.Empty : (isProc ? string.Empty : doc),
                AttendingNurse: isProc || (isDisp && !VisitTypeExtensions.IsPhysicianConsultationString(item.VisitType)) ? nurse : string.Empty,
                ChiefComplaint: string.Empty,
                NurseAssessment: string.Empty,
                VitalsSnapshot: string.Empty,
                DoctorDiagnosis: string.Empty,
                ClinicalAssessment: string.Empty,
                RosCategory: string.Empty,
                SystemsReviewed: string.Empty,
                ServiceDetails: details,
                Acuity: item.Acuity,
                Disposition: disposition
            ));
        }

        return rows;
    }
}
