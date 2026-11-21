using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;

public sealed class YakapReferralContext
{
    public required FacilitySettings Facility { get; set; }
    public required Patient Patient { get; set; }
    public required ReferralLetter Referral { get; set; }
    public ConsultationEncounter? Encounter { get; set; }
    public PatientGuardian? Guardian { get; set; }
    public IReadOnlyList<EncounterDiagnosis>? Diagnoses { get; set; }

    // Transaction & Accreditation Overrides
    public string? CaseNo { get; set; }
    public string? SoapTransNo { get; set; }
    public string? ReferralTransNo { get; set; }
    public string? PatientType { get; set; } // "MM" or "DD"
    public string? DoctorPan { get; set; }
    public string? DoctorPrc { get; set; }
    public string? ReferringDoctorPan { get; set; }
    public string? ReferringDoctorPrc { get; set; }
    public string? DoctorDesignation { get; set; }
    public string? PcuTransactionCode { get; set; }
    public string? MethodOfServiceDelivery { get; set; } // "1", "2", "3"
    public string? CoPaymentFlag { get; set; } // "Y" or "N"
    public decimal? CoPaymentAmount { get; set; }
    public decimal? CoPaymentBalance { get; set; }
    public DateOnly? CoPaymentDate { get; set; }
    public DateOnly? ReferralDate { get; set; }
    public TimeOnly? ReferralTime { get; set; }
    public IPhilHealthCatalogLookup? CatalogLookup { get; set; }
}

/// <summary>
/// PCAPI v2.0 Wire Builder for Annex F: Referral Request (PCAPI Service 07: DataUploadReferral).
/// Transforms pure 1NF ReferralLetter and clinical encounter domain models into official PhilHealth wire JSON.
/// Enforces all 32 Annex F statutory parameters, conditional guardian requirements for dependents (DD),
/// LIB-063 referral types, LIB-064 primary care services, LIB-065 facility services, and LIB-067 relationships.
/// </summary>
public sealed class YakapReferralWireBuilder : IYakapWireBuilder<YakapReferralContext, string>
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = null,
        WriteIndented = false
    };

    public Result<string> BuildWirePayload(YakapReferralContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        var errors = new List<string>();

        // 1. Facility Accreditation
        var accreNo = context.Facility.AccreditationNumber?.Trim();
        if (string.IsNullOrWhiteSpace(accreNo))
        {
            errors.Add("Facility accreditation number is required for PhilHealth wire payloads.");
        }

        // 2. Patient PIN (12-digit numeric)
        var pin = ResolvePatientPin(context.Patient);
        if (string.IsNullOrWhiteSpace(pin))
        {
            errors.Add("Patient must have a valid PhilHealth Identification Number (PIN).");
        }

        // 3. Referral Entity Check
        var refLetter = context.Referral;
        if (refLetter == null)
        {
            errors.Add("Referral letter entity is required.");
            return Result<string>.Failure(errors);
        }

        // 4. Referral Type (LIB-063)
        var refTypeCodes = ResolveReferralTypeCodes(context);
        if (string.IsNullOrWhiteSpace(refTypeCodes))
        {
            errors.Add("Referral type code is required (LIB-063: 01-08, 99).");
        }

        var typeList = (refTypeCodes ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        // 5. Conditional Referral Type Rules
        var specialist = refLetter.SpecialistType?.Trim() ?? refLetter.ReferredDepartment?.Trim() ?? string.Empty;
        var reason = refLetter.ReasonForReferral?.Trim() ?? string.Empty;

        if (typeList.Contains("01"))
        {
            if (string.IsNullOrWhiteSpace(specialist))
            {
                errors.Add("Referral specialist is required when referral type includes 01 (Refer to specialist).");
            }

            if (string.IsNullOrWhiteSpace(reason))
            {
                errors.Add("Referral reason is required when referral type includes 01 (Refer to specialist).");
            }

            if (string.Equals(specialist, "Other Specialist", StringComparison.OrdinalIgnoreCase) &&
                string.IsNullOrWhiteSpace(refLetter.SpecialistOtherSpecify))
            {
                errors.Add("Specialist other specify is required when referral specialist is 'Other Specialist'.");
            }
        }

        if (typeList.Contains("02"))
        {
            var primaryCareServices = refLetter.PrimaryCareServiceCodes?.Trim();
            if (string.IsNullOrWhiteSpace(primaryCareServices))
            {
                errors.Add("Referral primary care services are required when referral type includes 02 (LIB-064).");
            }
        }

        if (typeList.Contains("03"))
        {
            var facilityServices = refLetter.FacilityServiceCodes?.Trim();
            if (string.IsNullOrWhiteSpace(facilityServices))
            {
                errors.Add("Referral facility service is required when referral type includes 03 (LIB-065).");
            }
        }

        if (typeList.Contains("99"))
        {
            if (string.IsNullOrWhiteSpace(refLetter.OthersSpecify))
            {
                errors.Add("Referral others specify is required when referral type includes 99 (Others).");
            }
        }

        // 6. Clinical Reason & Diagnosis
        if (string.IsNullOrWhiteSpace(reason))
        {
            errors.Add("Referral reason is required.");
        }

        var diagnosis = refLetter.ProvisionalDiagnosis?.Trim();
        var icdCode = ResolveIcd10Code(context);
        if (string.IsNullOrWhiteSpace(diagnosis) && string.IsNullOrWhiteSpace(icdCode))
        {
            errors.Add("Referral must contain a provisional diagnosis or ICD-10 code.");
        }

        // 7. Attending / Referring Physician Credentials
        var doctorName = ResolveDoctorName(context);
        if (string.IsNullOrWhiteSpace(doctorName))
        {
            errors.Add("Referring physician name is required.");
        }

        var doctorPrc = ResolveDoctorPrc(context);
        if (string.IsNullOrWhiteSpace(doctorPrc))
        {
            errors.Add("Referring physician PRC license number is required.");
        }

        var doctorPan = ResolveDoctorPan(context);
        if (string.IsNullOrWhiteSpace(doctorPan))
        {
            errors.Add("Referring physician PhilHealth accreditation number (PAN) is required.");
        }

        // 8. Patient Type & Dependent Guardian Rule
        var patientType = ResolvePatientType(context);
        var guardian = context.Guardian ?? context.Patient.Guardians.FirstOrDefault();

        if (patientType == "DD")
        {
            if (guardian == null)
            {
                errors.Add("Guardian information is required for dependent patients (patient_type = DD).");
            }
            else
            {
                if (string.IsNullOrWhiteSpace(guardian.LastName) || string.IsNullOrWhiteSpace(guardian.FirstName))
                {
                    errors.Add("Guardian full name is required for dependent patients.");
                }

                if (!guardian.BirthDate.HasValue)
                {
                    errors.Add("Guardian birth date is required for dependent patients.");
                }

                if (string.IsNullOrWhiteSpace(guardian.ContactNumber))
                {
                    errors.Add("Guardian contact number is required for dependent patients.");
                }

                if (string.IsNullOrWhiteSpace(guardian.RelationshipCode))
                {
                    errors.Add("Guardian relationship code is required for dependent patients (LIB-067).");
                }
            }
        }

        if (errors.Count > 0)
        {
            return Result<string>.Failure(errors);
        }

        // 9. Format Dates & Transactions
        var referralDate = context.ReferralDate ?? refLetter.ReferralDate;
        var asOfDate = referralDate != default ? referralDate : DateOnly.FromDateTime(DateTime.UtcNow);
        var consultDateStr = (context.Encounter?.EncounterDate != null
            ? DateOnly.FromDateTime(context.Encounter.EncounterDate)
            : asOfDate).ToString("yyyy-MM-dd");
        var consultTimeStr = (context.Encounter?.EncounterDate != null
            ? context.Encounter.EncounterDate.ToString("HH:mm")
            : (context.ReferralTime?.ToString("HH:mm") ?? "08:00"));

        var caseNo = ResolveCaseNo(context, accreNo!, asOfDate);
        var soapTransNo = ResolveSoapTransNo(context, accreNo!, asOfDate);
        var refTransNo = ResolveReferralTransNo(context, accreNo!, asOfDate);
        var patientAge = FormatPhilHealthAge(context.Patient.DateOfBirth, asOfDate);
        var doctorDesignation = context.DoctorDesignation ?? refLetter.ReferringDoctorDesignation ?? "Attending Physician";
        var serviceDelivery = context.MethodOfServiceDelivery ?? (context.Encounter != null ? ((int)context.Encounter.ServiceDeliveryMethod).ToString() : "1");

        // 10. Construct Wire Payload Dictionary
        var wireDict = new Dictionary<string, object?>
        {
            // Root canonical PCAPI keys
            ["pHciAccreNo"] = accreNo,
            ["pHciCaseNo"] = caseNo,
            ["pSoapTransNo"] = soapTransNo,
            ["pPatientPin"] = pin,
            ["pPatientType"] = patientType,
            ["pPatientAge"] = patientAge,
            ["pReferralTransNo"] = refTransNo,
            ["pReferralNo"] = refLetter.ReferralNumber?.Trim() ?? refTransNo,
            ["pReferralDate"] = asOfDate.ToString("yyyy-MM-dd"),
            ["pReferralTime"] = consultTimeStr,
            ["pReferralType"] = refTypeCodes,
            ["pReferralSpecialist"] = specialist,
            ["pReferralSpecialistOtherSpec"] = refLetter.SpecialistOtherSpecify?.Trim() ?? string.Empty,
            ["pReferralReason"] = reason,
            ["pReferralPrimaryCareServices"] = refLetter.PrimaryCareServiceCodes?.Trim() ?? string.Empty,
            ["pReferralFacilityService"] = refLetter.FacilityServiceCodes?.Trim() ?? string.Empty,
            ["pReferralOthersSpec"] = refLetter.OthersSpecify?.Trim() ?? string.Empty,
            ["pReceivingFacilityAccreNo"] = refLetter.ReceivingFacilityAccreditationNo?.Trim() ?? string.Empty,
            ["pReceivingFacilityName"] = refLetter.ReferredToFacility?.Trim() ?? string.Empty,
            ["pReferredDepartment"] = refLetter.ReferredDepartment?.Trim() ?? string.Empty,
            ["pReferredToDoctor"] = refLetter.ReferredToDoctor?.Trim() ?? string.Empty,
            ["pUrgency"] = refLetter.Urgency?.Trim() ?? "Routine",
            ["pProvisionalDiagnosis"] = diagnosis ?? string.Empty,
            ["pDiagnosisIcdCode"] = icdCode ?? string.Empty,
            ["pClinicalSummary"] = refLetter.ClinicalSummary?.Trim() ?? string.Empty,
            ["pDoctorName"] = doctorName,
            ["pDoctorDesignation"] = doctorDesignation,
            ["pDoctorPrc"] = doctorPrc,
            ["pDoctorPan"] = doctorPan,
            ["pMethodOfServiceDelivery"] = serviceDelivery,
            ["pPcuTransactionCode"] = context.PcuTransactionCode ?? string.Empty,
            ["pCoPaymentFlag"] = context.CoPaymentFlag ?? (context.Encounter?.HasCoPayment == true ? "Y" : "N"),
            ["pCoPayment"] = context.CoPaymentAmount ?? context.Encounter?.CoPaymentAmount ?? 0m,
            ["pCoPaymentBalance"] = context.CoPaymentBalance ?? context.Encounter?.CoPaymentBalance ?? 0m,

            // Annex F Grouped Objects
            ["soap"] = new Dictionary<string, object?>
            {
                ["case_no"] = caseNo,
                ["soap_transaction_no"] = soapTransNo,
                ["patient_type"] = patientType,
                ["patient_pin"] = pin,
                ["patient_age"] = patientAge,
                ["method_of_service_delivery"] = serviceDelivery,
                ["pcu_transaction_code"] = context.PcuTransactionCode ?? string.Empty,
                ["co_payment_flag"] = context.CoPaymentFlag ?? (context.Encounter?.HasCoPayment == true ? "Y" : "N"),
                ["co_payment_date_payment"] = context.CoPaymentDate?.ToString("MM/dd/yyyy") ?? (context.Encounter?.CoPaymentDate?.ToString("MM/dd/yyyy") ?? string.Empty),
                ["co_payment"] = context.CoPaymentAmount ?? context.Encounter?.CoPaymentAmount ?? 0m,
                ["co_payment_balance"] = context.CoPaymentBalance ?? context.Encounter?.CoPaymentBalance ?? 0m,
                ["consultation_date"] = consultDateStr,
                ["consultation_time"] = consultTimeStr
            },

            ["referral"] = new Dictionary<string, object?>
            {
                ["referral_transaction_no"] = refTransNo,
                ["referral_type"] = refTypeCodes,
                ["referral_specialist"] = specialist,
                ["referral_specialist_other_spec"] = refLetter.SpecialistOtherSpecify?.Trim() ?? string.Empty,
                ["referral_reason"] = reason,
                ["referral_primary_care_services"] = refLetter.PrimaryCareServiceCodes?.Trim() ?? string.Empty,
                ["referral_facility_service"] = refLetter.FacilityServiceCodes?.Trim() ?? string.Empty,
                ["referral_others_spec"] = refLetter.OthersSpecify?.Trim() ?? string.Empty
            },

            ["physiciansignoff"] = new Dictionary<string, object?>
            {
                ["physician_name"] = doctorName,
                ["physician_designation"] = doctorDesignation,
                ["physician_license_no"] = doctorPrc,
                ["physician_accre_no"] = doctorPan
            }
        };

        // Conditional Guardian Block (Required if DD, strictly omitted if MM)
        if (patientType == "DD" && guardian != null)
        {
            var guardianAge = guardian.BirthDate.HasValue
                ? CalculateYears(guardian.BirthDate.Value, asOfDate)
                : 18;

            var guardianDict = new Dictionary<string, object?>
            {
                ["guardian_name"] = $"{guardian.FirstName} {guardian.LastName}".Trim(),
                ["guardian_age"] = guardianAge,
                ["guardian_sex"] = guardian.Sex == BiologicalSex.Female ? "F" : "M",
                ["guardian_birthday"] = guardian.BirthDate?.ToString("MM/dd/yyyy") ?? string.Empty,
                ["guardian_contact_no"] = guardian.ContactNumber?.Trim() ?? string.Empty,
                ["guardian_relationship"] = guardian.RelationshipCode?.Trim() ?? "OAD",
                ["guardian_pin"] = guardian.PhilHealthPin?.Trim() ?? string.Empty
            };

            wireDict["pGuardian"] = new Dictionary<string, object?>
            {
                ["pGuardianName"] = $"{guardian.FirstName} {guardian.LastName}".Trim(),
                ["pGuardianAge"] = guardianAge,
                ["pGuardianSex"] = guardian.Sex == BiologicalSex.Female ? "F" : "M",
                ["pGuardianBirthday"] = guardian.BirthDate?.ToString("yyyy-MM-dd") ?? string.Empty,
                ["pGuardianContactNo"] = guardian.ContactNumber?.Trim() ?? string.Empty,
                ["pGuardianRelationship"] = guardian.RelationshipCode?.Trim() ?? "OAD",
                ["pGuardianPin"] = guardian.PhilHealthPin?.Trim() ?? string.Empty
            };

            wireDict["guardian"] = guardianDict;
        }

        var json = JsonSerializer.Serialize(wireDict, JsonOpts);
        return Result<string>.Success(json);
    }

    public Result<PhilHealthEncryptedPayload> BuildEncryptedPayload(
        YakapReferralContext context,
        string cipherKey,
        IPhilHealthPayloadEncryptor encryptor)
    {
        var buildResult = BuildWirePayload(context);
        if (buildResult.IsFailure)
        {
            return Result<PhilHealthEncryptedPayload>.Failure(buildResult.Errors);
        }

        var encrypted = encryptor.EncryptJson(buildResult.Value!, cipherKey);
        return Result<PhilHealthEncryptedPayload>.Success(encrypted);
    }

    // ── Helper Methods ────────────────────────────────────────────────────────

    private static string? ResolvePatientPin(Patient patient)
    {
        if (!string.IsNullOrWhiteSpace(patient.PhilHealthNumber))
        {
            var clean = new string(patient.PhilHealthNumber.Where(char.IsDigit).ToArray());
            if (clean.Length == 12) return clean;
        }

        if (patient.PhilHealthMembership != null)
        {
            if (!string.IsNullOrWhiteSpace(patient.PhilHealthMembership.MemberPin))
            {
                var clean = new string(patient.PhilHealthMembership.MemberPin.Where(char.IsDigit).ToArray());
                if (clean.Length == 12) return clean;
            }

            if (!string.IsNullOrWhiteSpace(patient.PhilHealthMembership.PrincipalMemberPin))
            {
                var clean = new string(patient.PhilHealthMembership.PrincipalMemberPin.Where(char.IsDigit).ToArray());
                if (clean.Length == 12) return clean;
            }
        }

        return null;
    }

    private static string ResolvePatientType(YakapReferralContext context)
    {
        if (!string.IsNullOrWhiteSpace(context.PatientType))
        {
            return context.PatientType.Trim().ToUpperInvariant();
        }

        if (context.Patient.PhilHealthMembership != null)
        {
            return context.Patient.PhilHealthMembership.MemberType == PhilHealthMemberType.DD ? "DD" : "MM";
        }

        return "MM";
    }

    private static string? ResolveReferralTypeCodes(YakapReferralContext context)
    {
        if (!string.IsNullOrWhiteSpace(context.Referral.ReferralTypeCodes))
        {
            return context.Referral.ReferralTypeCodes.Trim();
        }

        if (!string.IsNullOrWhiteSpace(context.Referral.SpecialistType))
        {
            return "01";
        }

        if (!string.IsNullOrWhiteSpace(context.Referral.PrimaryCareServiceCodes))
        {
            return "02";
        }

        if (!string.IsNullOrWhiteSpace(context.Referral.FacilityServiceCodes))
        {
            return "03";
        }

        return "01";
    }

    private static string? ResolveIcd10Code(YakapReferralContext context)
    {
        var diag = context.Diagnoses?.FirstOrDefault(d => d.IsPrimary) ?? context.Diagnoses?.FirstOrDefault();
        if (diag != null && !string.IsNullOrWhiteSpace(diag.Icd10Code))
        {
            return diag.Icd10Code.Trim();
        }

        var encDiag = context.Encounter?.Diagnoses?.FirstOrDefault(d => d.IsPrimary) ?? context.Encounter?.Diagnoses?.FirstOrDefault();
        if (encDiag != null && !string.IsNullOrWhiteSpace(encDiag.Icd10Code))
        {
            return encDiag.Icd10Code.Trim();
        }

        return null;
    }

    private static string ResolveDoctorName(YakapReferralContext context)
    {
        if (!string.IsNullOrWhiteSpace(context.Referral.ReferringDoctorName))
            return context.Referral.ReferringDoctorName.Trim();

        if (context.Encounter != null && !string.IsNullOrWhiteSpace(context.Encounter.DoctorName))
            return context.Encounter.DoctorName.Trim();

        return string.Empty;
    }

    private static string ResolveDoctorPrc(YakapReferralContext context)
    {
        var prc = context.DoctorPrc ?? context.ReferringDoctorPrc;
        if (!string.IsNullOrWhiteSpace(prc))
            return prc.Trim();

        if (!string.IsNullOrWhiteSpace(context.Referral.ReferringDoctorPrcNumber))
            return context.Referral.ReferringDoctorPrcNumber.Trim();

        if (context.Encounter != null && !string.IsNullOrWhiteSpace(context.Encounter.DoctorPrcLicense))
            return context.Encounter.DoctorPrcLicense.Trim();

        return string.Empty;
    }

    private static string ResolveDoctorPan(YakapReferralContext context)
    {
        var pan = context.DoctorPan ?? context.ReferringDoctorPan;
        if (!string.IsNullOrWhiteSpace(pan))
            return pan.Trim();

        if (!string.IsNullOrWhiteSpace(context.Referral.ReferringDoctorPhilHealthPan))
            return context.Referral.ReferringDoctorPhilHealthPan.Trim();

        if (context.Encounter != null && !string.IsNullOrWhiteSpace(context.Encounter.DoctorPhilHealthPan))
            return context.Encounter.DoctorPhilHealthPan.Trim();

        return string.Empty;
    }

    private static string ResolveCaseNo(YakapReferralContext context, string accreNo, DateOnly asOfDate)
    {
        if (!string.IsNullOrWhiteSpace(context.CaseNo))
            return context.CaseNo.Trim();

        if (context.Encounter != null && !string.IsNullOrWhiteSpace(context.Encounter.PhilHealthCaseNo))
            return context.Encounter.PhilHealthCaseNo.Trim();

        return $"T{accreNo}{asOfDate:yyyyMMdd}00001";
    }

    private static string ResolveSoapTransNo(YakapReferralContext context, string accreNo, DateOnly asOfDate)
    {
        if (!string.IsNullOrWhiteSpace(context.SoapTransNo))
            return context.SoapTransNo.Trim();

        if (context.Encounter != null && !string.IsNullOrWhiteSpace(context.Encounter.PhilHealthSoapTransNo))
            return context.Encounter.PhilHealthSoapTransNo.Trim();

        return $"S{accreNo}{asOfDate:yyyyMMdd}00001";
    }

    private static string ResolveReferralTransNo(YakapReferralContext context, string accreNo, DateOnly asOfDate)
    {
        if (!string.IsNullOrWhiteSpace(context.ReferralTransNo))
            return context.ReferralTransNo.Trim();

        if (!string.IsNullOrWhiteSpace(context.Referral.PhilHealthReferralTransNo))
            return context.Referral.PhilHealthReferralTransNo.Trim();

        return $"R{accreNo}{asOfDate:yyyyMMdd}00001";
    }

    public static string FormatPhilHealthAge(DateOnly birthDate, DateOnly asOfDate)
    {
        if (asOfDate < birthDate) return "0 YR(S), 0 MO(S), 0 DAY(S)";

        int years = asOfDate.Year - birthDate.Year;
        int months = asOfDate.Month - birthDate.Month;
        int days = asOfDate.Day - birthDate.Day;

        if (days < 0)
        {
            months--;
            var prevMonth = asOfDate.AddMonths(-1);
            days += DateTime.DaysInMonth(prevMonth.Year, prevMonth.Month);
        }

        if (months < 0)
        {
            years--;
            months += 12;
        }

        return $"{years} YR(S), {months} MO(S), {days} DAY(S)";
    }

    private static int CalculateYears(DateOnly birthDate, DateOnly asOfDate)
    {
        int age = asOfDate.Year - birthDate.Year;
        if (asOfDate < birthDate.AddYears(age)) age--;
        return Math.Max(0, age);
    }
}
