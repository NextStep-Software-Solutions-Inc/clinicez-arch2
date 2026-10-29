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
            ["pHciCaseNo"] = context.EnlistmentCaseNo ?? p.PatientCode ?? string.Empty,
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
}
