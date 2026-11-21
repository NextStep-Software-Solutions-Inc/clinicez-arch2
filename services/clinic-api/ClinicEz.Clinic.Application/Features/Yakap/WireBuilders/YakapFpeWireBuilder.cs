using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Options;

namespace ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;

public sealed class YakapFpeContext
{
    public required FacilitySettings Facility { get; set; }
    public required Patient Patient { get; set; }
    public PatientAddress? Address { get; set; }
    public PatientVitals? Vitals { get; set; }
    public IReadOnlyList<PatientMedicalHistory>? MedicalHistory { get; set; }
    public IReadOnlyList<PatientFamilyHistory>? FamilyHistory { get; set; }
    public IReadOnlyList<PatientAllergy>? Allergies { get; set; }
    public IReadOnlyList<PatientImmunization>? Immunizations { get; set; }
    public PatientSocialHistory? SocialHistory { get; set; }
    public PatientPhysicalExam? PhysicalExam { get; set; }
    public NcdRiskAssessment? NcdAssessment { get; set; }
    public ConsultationEncounter? Encounter { get; set; }
    public string? EnlistmentCaseNo { get; set; }
    public string? TransmittalNo { get; set; }
    public DateOnly? EffectiveDate { get; set; }
    public HealthScreening? HealthScreening { get; set; }
    public PatientYakapEnlistment? Enlistment { get; set; }
    public string? ProfilingTransNo { get; set; }
    public DateOnly? ProfilingDate { get; set; }
    public TimeOnly? ProfilingTime { get; set; }
    public string? ProfilingAtc { get; set; }
    public bool? IsWalkedIn { get; set; }
    public YakapServiceDeliveryMethod? ServiceDeliveryMethod { get; set; }
    public string? FpeClassificationType { get; set; }
    public string? FacilitatorType { get; set; }
    public string? FacilitatorName { get; set; }
}

/// <summary>
/// PCAPI v2.0 Wire Builder for Annex A: First Patient Encounter (FPE) and Profiling.
/// Converts pure 1NF clinical domain entities into official PhilHealth wire JSON.
/// </summary>
public sealed class YakapFpeWireBuilder : IYakapWireBuilder<YakapFpeContext, string>
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = null,
        WriteIndented = false
    };

    public Result<string> BuildWirePayload(YakapFpeContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        var errors = new List<string>();

        var accreNo = context.Facility.AccreditationNumber?.Trim();
        if (string.IsNullOrWhiteSpace(accreNo))
        {
            errors.Add("Facility accreditation number is required for PhilHealth wire payloads.");
        }

        var pin = ResolvePatientPin(context.Patient);
        if (string.IsNullOrWhiteSpace(pin))
        {
            errors.Add("Patient must have a valid PhilHealth Identification Number (PIN).");
        }

        if (string.IsNullOrWhiteSpace(context.Patient.LastName))
        {
            errors.Add("Patient last name is required.");
        }

        if (string.IsNullOrWhiteSpace(context.Patient.FirstName))
        {
            errors.Add("Patient first name is required.");
        }

        if (context.Patient.DateOfBirth == default || context.Patient.DateOfBirth > DateOnly.FromDateTime(DateTime.UtcNow))
        {
            errors.Add("Patient date of birth must be a valid past date.");
        }

        if (errors.Count > 0)
        {
            return Result<string>.Failure(errors);
        }

        var p = context.Patient;
        var addr = context.Address ?? p.Addresses.FirstOrDefault();
        var v = context.Vitals;

        var wireDict = new Dictionary<string, object?>
        {
            ["pHciAccreNo"] = accreNo,
            ["pHciCaseNo"] = context.EnlistmentCaseNo ?? context.Enlistment?.CaseNo ?? p.PatientCode ?? string.Empty,
            ["pPatientPin"] = pin,
            ["pPatientLName"] = p.LastName.Trim(),
            ["pPatientFName"] = p.FirstName.Trim(),
            ["pPatientMName"] = p.MiddleName?.Trim() ?? string.Empty,
            ["pPatientExtName"] = p.Suffix?.Trim() ?? string.Empty,
            ["pPatientDob"] = p.DateOfBirth.ToString("yyyy-MM-dd"),
            ["pPatientSex"] = MapSexToStatutory(p.Sex),
            ["pCivilStatus"] = MapCivilStatusToStatutory(p.CivilStatus),
            ["pContactNo"] = p.ContactNumber?.Trim() ?? p.AlternateContactNumber?.Trim() ?? string.Empty,
            ["pEmailAdd"] = p.Email?.Trim() ?? string.Empty,
            ["pStreet"] = addr?.StreetAddress?.Trim() ?? string.Empty,
            ["pBrgyCode"] = addr?.BarangayPsgc?.Trim() ?? string.Empty,
            ["pMunCode"] = addr?.CityMunicipalityPsgc?.Trim() ?? string.Empty,
            ["pProvCode"] = addr?.ProvincePsgc?.Trim() ?? string.Empty,
            ["pRegCode"] = addr?.RegionPsgc?.Trim() ?? string.Empty,
            ["pZipCode"] = addr?.ZipCode?.Trim() ?? string.Empty,
            ["pBloodType"] = MapBloodTypeToStatutory(p.BloodType),
            ["pEffectiveDate"] = (context.EffectiveDate ?? DateOnly.FromDateTime(DateTime.UtcNow)).ToString("yyyy-MM-dd")
        };

        // Vitals
        if (v != null)
        {
            wireDict["pVitals"] = new Dictionary<string, object?>
            {
                ["pSystolic"] = v.SystolicBp,
                ["pDiastolic"] = v.DiastolicBp,
                ["pHr"] = v.HeartRateBpm,
                ["pRr"] = v.RespiratoryRateBreathsPerMin,
                ["pTemp"] = v.TemperatureCelsius,
                ["pHeight"] = v.HeightCm,
                ["pWeight"] = v.WeightKg,
                ["pBmi"] = v.Bmi,
                ["pWaist"] = v.WaistCircumferenceCm
            };
        }

        // Past Medical History
        if (context.MedicalHistory != null && context.MedicalHistory.Count > 0)
        {
            wireDict["pPastMedHistory"] = context.MedicalHistory.Select(m => new Dictionary<string, object?>
            {
                ["pCondition"] = m.ConditionTitle?.Trim() ?? m.SpecificDescription?.Trim() ?? string.Empty,
                ["pIcd10Code"] = m.Icd10Code?.Trim() ?? string.Empty,
                ["pDiseaseCode"] = m.PhilHealthMdiseaseCode?.Trim() ?? string.Empty,
                ["pDiagnosedYear"] = m.OnsetDate?.Year,
                ["pIsControlled"] = m.Status == ProblemStatus.Active
            }).ToList();
        }

        // Family History
        if (context.FamilyHistory != null && context.FamilyHistory.Count > 0)
        {
            wireDict["pFamilyHistory"] = context.FamilyHistory.Select(f => new Dictionary<string, object?>
            {
                ["pCondition"] = f.ConditionTitle?.Trim() ?? f.SpecificDescription?.Trim() ?? string.Empty,
                ["pRelationship"] = f.Relationship.ToString()
            }).ToList();
        }

        // Allergies
        if (context.Allergies != null && context.Allergies.Count > 0)
        {
            wireDict["pAllergies"] = context.Allergies.Select(a => new Dictionary<string, object?>
            {
                ["pAllergen"] = a.Allergen?.Trim() ?? string.Empty,
                ["pReaction"] = a.ReactionManifestation?.Trim() ?? string.Empty,
                ["pSeverity"] = a.Severity.ToString()
            }).ToList();
        }

        // Immunizations
        if (context.Immunizations != null && context.Immunizations.Count > 0)
        {
            wireDict["pImmunizations"] = context.Immunizations.Select(i => new Dictionary<string, object?>
            {
                ["pVaccineName"] = i.VaccineName?.Trim() ?? string.Empty,
                ["pDoseNumber"] = i.DoseSequence,
                ["pDateAdministered"] = i.AdministeredAtUtc.ToString("yyyy-MM-dd")
            }).ToList();
        }

        // FPE Profiling Metadata (only emitted when provided via context, HealthScreening, or Enlistment)
        var profTransNo = FirstNonEmpty(context.ProfilingTransNo, context.HealthScreening?.ProfilingTransNo, context.Enlistment?.ProfilingTransNo);
        if (profTransNo != null)
            wireDict["pProfilingTransNo"] = profTransNo;

        var profDate = context.ProfilingDate
            ?? context.Enlistment?.ProfilingDate
            ?? (context.HealthScreening?.CompletedAtUtc.HasValue == true
                ? DateOnly.FromDateTime(context.HealthScreening.CompletedAtUtc.Value)
                : null);
        if (profDate.HasValue)
            wireDict["pProfilingDate"] = profDate.Value.ToString("yyyy-MM-dd");

        var profTime = context.ProfilingTime ?? context.Enlistment?.ProfilingTime;
        if (profTime.HasValue)
            wireDict["pProfilingTime"] = profTime.Value.ToString("HH:mm:ss");

        var profAtc = FirstNonEmpty(context.ProfilingAtc, context.HealthScreening?.PhilHealthAtc, context.Enlistment?.ProfilingAtc);
        if (profAtc != null)
            wireDict["pProfilingAtc"] = profAtc;

        bool? resolvedWalkIn = context.IsWalkedIn
            ?? (context.HealthScreening != null ? (bool?)context.HealthScreening.IsWalkedIn : null)
            ?? (context.Enlistment != null ? (bool?)context.Enlistment.IsWalkedIn : null);
        if (resolvedWalkIn.HasValue)
            wireDict["pIsWalkedIn"] = resolvedWalkIn.Value ? "Y" : "N";

        var deliveryMethodCode = context.ServiceDeliveryMethod.HasValue
            ? MapDeliveryMethodCode(context.ServiceDeliveryMethod.Value)
            : (context.HealthScreening != null
                ? MapDeliveryMethodCode(context.HealthScreening.ServiceDeliveryMethod)
                : FirstNonEmpty(context.Enlistment?.ServiceDeliveryMethod));
        if (deliveryMethodCode != null)
            wireDict["pServiceDeliveryMethod"] = deliveryMethodCode;

        var fpeClassification = FirstNonEmpty(context.FpeClassificationType, context.HealthScreening?.FpeClassificationType, context.Enlistment?.FpeClassificationType);
        if (fpeClassification != null)
            wireDict["pFpeClassificationType"] = fpeClassification;

        var facilitatorType = FirstNonEmpty(context.FacilitatorType, context.Enlistment?.FacilitatorType);
        if (facilitatorType != null)
            wireDict["pFacilitatorType"] = facilitatorType;

        var facilitatorName = FirstNonEmpty(
            context.FacilitatorName,
            context.Enlistment?.FacilitatorName,
            context.HealthScreening?.ExaminedByDoctorName,
            context.HealthScreening?.ScreenedByNurseName);
        if (facilitatorName != null)
            wireDict["pFacilitatorName"] = facilitatorName;

        // Physical Examination (omitted when null)
        if (context.PhysicalExam != null)
        {
            var pe = context.PhysicalExam;
            wireDict["pPhysicalExam"] = new Dictionary<string, object?>
            {
                ["pGeneralSurveyId"] = FirstNonEmpty(pe.GenSurveyId) ?? (pe.GeneralSurveyStatus == GeneralSurveyStatus.Normal ? "1" : "2"),
                ["pGeneralSurveyRemarks"] = pe.GeneralSurveyRemarks?.Trim() ?? string.Empty,
                ["pSkinId"] = FirstNonEmpty(pe.SkinId) ?? "1",
                ["pSkinRemarks"] = pe.SkinRemarks?.Trim() ?? string.Empty,
                ["pHeentId"] = FirstNonEmpty(pe.HeentId) ?? "11",
                ["pHeentRemarks"] = pe.HeentRemarks?.Trim() ?? string.Empty,
                ["pChestId"] = FirstNonEmpty(pe.ChestId) ?? "6",
                ["pChestRemarks"] = pe.ChestLungsRemarks?.Trim() ?? string.Empty,
                ["pHeartId"] = FirstNonEmpty(pe.HeartId) ?? "5",
                ["pHeartRemarks"] = pe.HeartRemarks?.Trim() ?? string.Empty,
                ["pAbdomenId"] = FirstNonEmpty(pe.AbdomenId) ?? "7",
                ["pAbdomenRemarks"] = pe.AbdomenRemarks?.Trim() ?? string.Empty,
                ["pNeuroId"] = FirstNonEmpty(pe.NeuroId) ?? "6",
                ["pNeuroRemarks"] = pe.NeurologicalRemarks?.Trim() ?? string.Empty,
                ["pRectalId"] = FirstNonEmpty(pe.RectalId) ?? "1",
                ["pRectalRemarks"] = pe.DigitalRectalRemarks?.Trim() ?? string.Empty,
                ["pGuId"] = FirstNonEmpty(pe.GuId) ?? "1",
                ["pGuRemarks"] = pe.GenitourinaryRemarks?.Trim() ?? string.Empty
            };
        }

        // Social History (omitted when null)
        if (context.SocialHistory != null)
        {
            var sh = context.SocialHistory;
            wireDict["pSocialHistory"] = new Dictionary<string, object?>
            {
                ["pIsSmoker"] = sh.IsSmoker ? "Y" : "N",
                ["pSmokingStatus"] = sh.SmokingStatus?.Trim() ?? (sh.IsSmoker ? "current" : "never"),
                ["pPacksPerDay"] = sh.PacksPerDay,
                ["pCigarettesPerDay"] = sh.CigarettesPerDay,
                ["pYearsSmoking"] = sh.YearsSmoking,
                ["pSmokingPackYears"] = sh.SmokingPackYears,
                ["pIsAlcoholDrinker"] = sh.IsAlcoholDrinker ? "Y" : "N",
                ["pAlcoholStatus"] = sh.AlcoholStatus?.Trim() ?? (sh.IsAlcoholDrinker ? "current" : "never"),
                ["pAlcoholBottlesPerDay"] = sh.AlcoholBottlesPerDay,
                ["pAlcoholDrinksPerWeek"] = sh.AlcoholDrinksPerWeek,
                ["pIllDrugUser"] = sh.UsesIllicitDrugs ? "Y" : "N",
                ["pIsSexuallyActive"] = sh.IsSexuallyActive ? "Y" : "N",
                ["pPhysicalActivityCode"] = sh.PhysicalActivityFrequency?.Trim() ?? string.Empty,
                ["pDietaryIntakeCode"] = sh.DietaryHabits?.Trim() ?? string.Empty
            };
        }

        // NCD Risk Assessment (omitted when null)
        if (context.NcdAssessment != null)
        {
            var ncd = context.NcdAssessment;
            wireDict["pNcdAssessment"] = new Dictionary<string, object?>
            {
                ["pRiskBand"] = ncd.RiskBand?.Trim() ?? "BandA",
                ["pDiagnosedDiabetes"] = ncd.DiagnosedDiabetes?.Trim() ?? string.Empty,
                ["pHasChestPain"] = FormatYn(ncd.HasChestPain),
                ["pHasRaisedBloodGlucose"] = FormatYn(ncd.HasRaisedBloodGlucose),
                ["pFastingBloodSugarMgDl"] = ncd.FastingBloodSugarMgDl,
                ["pHasRaisedBloodLipids"] = FormatYn(ncd.HasRaisedBloodLipids),
                ["pTotalCholesterolMgDl"] = ncd.TotalCholesterolMgDl,
                ["pHasHistoryAnginaHeartAttack"] = FormatYn(ncd.HasHistoryAnginaHeartAttack),
                ["pHasHistoryStrokeOrTia"] = FormatYn(ncd.HasHistoryStrokeOrTia),
                ["pAssessmentDate"] = ncd.AssessmentDate.ToString("yyyy-MM-dd")
            };
        }

        var json = JsonSerializer.Serialize(wireDict, JsonOpts);
        return Result<string>.Success(json);
    }

    public Result<PhilHealthEncryptedPayload> BuildEncryptedPayload(
        YakapFpeContext context,
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

    private static string? ResolvePatientPin(Patient patient)
    {
        if (!string.IsNullOrWhiteSpace(patient.PhilHealthNumber))
            return patient.PhilHealthNumber.Trim();

        if (patient.PhilHealthMembership != null)
        {
            if (!string.IsNullOrWhiteSpace(patient.PhilHealthMembership.MemberPin))
                return patient.PhilHealthMembership.MemberPin.Trim();
            if (!string.IsNullOrWhiteSpace(patient.PhilHealthMembership.PrincipalMemberPin))
                return patient.PhilHealthMembership.PrincipalMemberPin.Trim();
        }

        return null;
    }

    private static string MapSexToStatutory(BiologicalSex? sex) => sex switch
    {
        BiologicalSex.Male => "M",
        BiologicalSex.Female => "F",
        _ => "M"
    };

    private static string MapCivilStatusToStatutory(CivilStatus? status) => status switch
    {
        CivilStatus.Single => "S",
        CivilStatus.Married => "M",
        CivilStatus.Widowed => "W",
        CivilStatus.Separated => "X",
        CivilStatus.Divorced => "D",
        _ => "S"
    };

    private static string? MapBloodTypeToStatutory(BloodType? bloodType) => bloodType switch
    {
        BloodType.APositive => "A+",
        BloodType.ANegative => "A-",
        BloodType.BPositive => "B+",
        BloodType.BNegative => "B-",
        BloodType.ABPositive => "AB+",
        BloodType.ABNegative => "AB-",
        BloodType.OPositive => "O+",
        BloodType.ONegative => "O-",
        _ => null
    };

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var v in values)
        {
            if (!string.IsNullOrWhiteSpace(v))
                return v.Trim();
        }
        return null;
    }

    private static string MapDeliveryMethodCode(YakapServiceDeliveryMethod method) => method switch
    {
        YakapServiceDeliveryMethod.FacilityBased => "1",
        YakapServiceDeliveryMethod.OutOfFacility => "2",
        YakapServiceDeliveryMethod.SettingsBased => "3",
        _ => "1"
    };

    private static string FormatYn(bool? value) => value switch
    {
        true => "Y",
        false => "N",
        null => string.Empty
    };
}
