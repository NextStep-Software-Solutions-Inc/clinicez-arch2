global using EncounterTimelineItemDto = ClinicEz.Clinic.Application.Features.Consultations.DTOs.ConsultationEncounterDto;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Consultations.DTOs;

public sealed record EncounterDiagnosisDto(
    Guid Id,
    string Icd10Code,
    string Description,
    bool IsPrimary);

public sealed record PrescriptionItemDto(
    Guid Id,
    string GenericName,
    string? BrandName,
    string Dosage,
    string Form,
    string Sig,
    int Quantity,
    int? DurationDays,
    int Refills,
    bool IsDangerousDrug,
    string? Remarks,
    string? PhilHealthDrugCode = null);

public sealed record ConsultationEncounterDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    Guid? QueueItemId,
    Guid? AppointmentId,
    Guid PatientId,
    string PatientName,
    Guid DoctorId,
    string DoctorName,
    DateTime EncounterDate,
    string Subjective,
    string Objective,
    string Assessment,
    string Plan,
    string? HomeInstructions,
    string? DoctorPrcLicense,
    string? DoctorPtr,
    string? DoctorS2License,
    bool IsSigned,
    DateTime? SignedAt,
    IReadOnlyList<EncounterDiagnosisDto> Diagnoses,
    IReadOnlyList<PrescriptionItemDto> Prescriptions,
    bool IsYakapEligible = false,
    string? PhilHealthSignSympCode = null,
    string? PhilHealthOtherComplaint = null,
    string? PhilHealthPainSite = null,
    string? PhilHealthCaseNo = null,
    string? PhilHealthSoapTransNo = null,
    string? DoctorPhilHealthPan = null,
    string? PhilHealthAtc = null,
    string? HciCaseNo = null,
    string? HciTransNo = null,
    string? SoapTransNo = null,
    string? GeneralSurveyId = null,
    string? GeneralSurveyRemarks = null,
    string? PhysicalExamFindingsJson = null,
    RxPharmacyStatusDto? RxStatus = null,
    List<DentalToothRecordDto>? DentalFindings = null,
    string? CounselingCodes = null,
    string? RoutineVaccineName = null,
    string? RoutineVaccineDate = null,
    string? AdultsRoutineScreeningCode = null,
    string? PediatricRoutineScreeningCode = null,
    string? PrenatalScreeningServicesCode = null,
    string? CancerScreeningCodes = null,
    string? DiagnosticServicesOption = null,
    bool HasMedicationPrescription = false,
    bool HasReferral = false,
    string? OtherMedicalAdviceSpec = null,
    bool HasFollowUp = false,
    string? FollowUpDate = null,
    string? FollowUpScheduleText = null,
    string? FollowUpReason = null,
    string? FollowUpVaccineName = null,
    string? FollowUpVaccineNextDate = null);

public static class ConsultationPlanManagementMapper
{
    public static void Apply(
        ConsultationEncounter encounter,
        string? counselingCodes,
        string? routineVaccineName,
        string? routineVaccineDate,
        string? adultsRoutineScreeningCode,
        string? pediatricRoutineScreeningCode,
        string? prenatalScreeningServicesCode,
        string? cancerScreeningCodes,
        string? diagnosticServicesOption,
        bool? hasMedicationPrescription,
        bool? hasReferral,
        string? otherMedicalAdviceSpec,
        bool? hasFollowUp,
        string? followUpDate,
        string? followUpScheduleText,
        string? followUpReason,
        string? followUpVaccineName,
        string? followUpVaccineNextDate)
    {
        if (counselingCodes != null) encounter.CounselingCodes = Truncate(counselingCodes, 100);
        if (routineVaccineName != null) encounter.RoutineVaccineName = Truncate(routineVaccineName, 255);
        if (routineVaccineDate != null) encounter.RoutineVaccineDate = ParseOptionalDate(routineVaccineDate);
        if (adultsRoutineScreeningCode != null) encounter.AdultsRoutineScreeningCode = Truncate(adultsRoutineScreeningCode, 100);
        if (pediatricRoutineScreeningCode != null) encounter.PediatricRoutineScreeningCode = Truncate(pediatricRoutineScreeningCode, 100);
        if (prenatalScreeningServicesCode != null) encounter.PrenatalScreeningServicesCode = Truncate(prenatalScreeningServicesCode, 100);
        if (cancerScreeningCodes != null) encounter.PhilHealthManagementCodes = string.IsNullOrWhiteSpace(cancerScreeningCodes) ? null : cancerScreeningCodes.Trim();
        if (diagnosticServicesOption != null) encounter.DiagnosticServicesOption = Truncate(diagnosticServicesOption, 10);
        if (hasMedicationPrescription.HasValue) encounter.HasMedicationPrescription = hasMedicationPrescription.Value;
        if (hasReferral.HasValue) encounter.HasReferral = hasReferral.Value;
        if (otherMedicalAdviceSpec != null) encounter.OtherMedicalAdviceSpec = Truncate(otherMedicalAdviceSpec, 500);
        if (hasFollowUp.HasValue) encounter.HasFollowUp = hasFollowUp.Value;
        if (followUpDate != null) encounter.FollowUpDate = ParseOptionalDate(followUpDate);
        if (followUpScheduleText != null) encounter.FollowUpScheduleText = Truncate(followUpScheduleText, 100);
        if (followUpReason != null) encounter.FollowUpReason = Truncate(followUpReason, 250);
        if (followUpVaccineName != null) encounter.FollowUpVaccineName = Truncate(followUpVaccineName, 255);
        if (followUpVaccineNextDate != null) encounter.FollowUpVaccineNextDate = ParseOptionalDate(followUpVaccineNextDate);
    }

    public static ConsultationEncounterDto ToDto(
        ConsultationEncounter encounter,
        string? hciTransNo = null,
        RxPharmacyStatusDto? rxStatus = null,
        List<DentalToothRecordDto>? dentalFindings = null,
        string? tenantIdOverride = null)
    {
        return new ConsultationEncounterDto(
            encounter.Id,
            tenantIdOverride ?? encounter.TenantId,
            encounter.ClinicId,
            encounter.QueueItemId,
            encounter.AppointmentId,
            encounter.PatientId,
            encounter.PatientName,
            encounter.DoctorId,
            encounter.DoctorName,
            encounter.EncounterDate,
            encounter.Subjective,
            encounter.Objective,
            encounter.Assessment,
            encounter.Plan,
            encounter.HomeInstructions,
            encounter.DoctorPrcLicense,
            encounter.DoctorPtr,
            encounter.DoctorS2License,
            encounter.IsSigned,
            encounter.SignedAt,
            encounter.Diagnoses.Select(d => new EncounterDiagnosisDto(d.Id, d.Icd10Code, d.Description, d.IsPrimary)).ToList(),
            encounter.Prescriptions.Select(p => new PrescriptionItemDto(p.Id, p.GenericName, p.BrandName, p.Dosage, p.Form, p.Sig, p.Quantity, p.DurationDays, p.Refills, p.IsDangerousDrug, p.Remarks, p.PhilHealthDrugCode)).ToList(),
            encounter.IsYakapEligible,
            encounter.PhilHealthSignSympCode,
            encounter.PhilHealthOtherComplaint,
            encounter.PhilHealthPainSite,
            encounter.PhilHealthCaseNo,
            encounter.PhilHealthSoapTransNo,
            encounter.DoctorPhilHealthPan,
            encounter.PhilHealthAtc,
            encounter.PhilHealthCaseNo,
            hciTransNo,
            encounter.PhilHealthSoapTransNo,
            encounter.PhysicalExams.FirstOrDefault()?.GenSurveyId,
            encounter.PhysicalExams.FirstOrDefault()?.GeneralSurveyRemarks,
            encounter.GetPhysicalExamFindings() != null ? System.Text.Json.JsonSerializer.Serialize(encounter.GetPhysicalExamFindings()) : null,
            rxStatus,
            dentalFindings,
            encounter.CounselingCodes,
            encounter.RoutineVaccineName,
            encounter.RoutineVaccineDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            encounter.AdultsRoutineScreeningCode,
            encounter.PediatricRoutineScreeningCode,
            encounter.PrenatalScreeningServicesCode,
            encounter.PhilHealthManagementCodes,
            encounter.DiagnosticServicesOption,
            encounter.HasMedicationPrescription || encounter.Prescriptions.Count > 0,
            encounter.HasReferral,
            encounter.OtherMedicalAdviceSpec,
            encounter.HasFollowUp,
            encounter.FollowUpDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            encounter.FollowUpScheduleText,
            encounter.FollowUpReason,
            encounter.FollowUpVaccineName,
            encounter.FollowUpVaccineNextDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
    }

    private static string? Truncate(string? value, int maxLen)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= maxLen ? trimmed : trimmed[..maxLen];
    }

    private static DateOnly? ParseOptionalDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        if (DateOnly.TryParseExact(
            trimmed,
            new[] { "yyyy-MM-dd", "MM/dd/yyyy", "M/d/yyyy" },
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var exact))
        {
            return exact;
        }
        if (DateOnly.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return parsed;
        }
        return null;
    }
}
