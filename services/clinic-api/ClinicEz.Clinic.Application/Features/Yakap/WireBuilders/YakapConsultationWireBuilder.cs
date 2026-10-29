using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;

public sealed class YakapConsultationContext
{
    public required FacilitySettings Facility { get; set; }
    public required Patient Patient { get; set; }
    public required ConsultationEncounter Encounter { get; set; }
    public PatientVitals? Vitals { get; set; }
    public PatientPhysicalExam? PhysicalExam { get; set; }
    public IReadOnlyList<EncounterDiagnosis>? Diagnoses { get; set; }
    public string? DoctorPan { get; set; }
    public string? DoctorPrc { get; set; }
    public string? CaseNo { get; set; }
}

/// <summary>
/// PCAPI v2.0 Wire Builder for Annex B: Follow-up Consultation Encounter.
/// Converts pure 1NF clinical encounter domain entities into official PhilHealth wire JSON.
/// </summary>
public sealed class YakapConsultationWireBuilder : IYakapWireBuilder<YakapConsultationContext, string>
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = null,
        WriteIndented = false
    };

    public Result<string> BuildWirePayload(YakapConsultationContext context)
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

        var diagnoses = context.Diagnoses ?? (IReadOnlyList<EncounterDiagnosis>)(context.Encounter.Diagnoses != null ? context.Encounter.Diagnoses.ToList() : Array.Empty<EncounterDiagnosis>());
        if (diagnoses == null || diagnoses.Count == 0)
        {
            errors.Add("Consultation encounter must have at least one diagnosis ICD-10 code.");
        }

        var enc = context.Encounter;
        if (enc.EncounterDate == default)
        {
            errors.Add("Consultation date is required.");
        }

        if (errors.Count > 0)
        {
            return Result<string>.Failure(errors);
        }

        var v = context.Vitals;

        var wireDict = new Dictionary<string, object?>
        {
            ["pHciAccreNo"] = accreNo,
            ["pHciCaseNo"] = context.CaseNo ?? enc.PhilHealthCaseNo ?? context.Patient.PatientCode ?? string.Empty,
            ["pPatientPin"] = pin,
            ["pConsultDate"] = enc.EncounterDate.ToString("yyyy-MM-dd"),
            ["pConsultTime"] = enc.EncounterDate.ToString("HH:mm:ss"),
            ["pDoctorPan"] = context.DoctorPan ?? enc.DoctorPhilHealthPan ?? string.Empty,
            ["pDoctorPrc"] = context.DoctorPrc ?? enc.DoctorPrcLicense ?? string.Empty,
            ["pChiefComplaint"] = !string.IsNullOrWhiteSpace(enc.Subjective) ? enc.Subjective.Trim() : (enc.PhilHealthOtherComplaint?.Trim() ?? string.Empty),
            ["pSubjective"] = enc.Subjective?.Trim() ?? string.Empty,
            ["pObjective"] = enc.Objective?.Trim() ?? string.Empty,
            ["pAssessment"] = enc.Assessment?.Trim() ?? string.Empty,
            ["pPlan"] = enc.Plan?.Trim() ?? string.Empty,
            ["pDiagnoses"] = diagnoses!.Select(d => new Dictionary<string, object?>
            {
                ["pIcdCode"] = d.Icd10Code?.Trim() ?? string.Empty,
                ["pDescription"] = d.Description?.Trim() ?? string.Empty,
                ["pIsPrimary"] = d.IsPrimary
            }).ToList()
        };

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
                ["pBmi"] = v.Bmi
            };
        }

        var json = JsonSerializer.Serialize(wireDict, JsonOpts);
        return Result<string>.Success(json);
    }

    public Result<PhilHealthEncryptedPayload> BuildEncryptedPayload(
        YakapConsultationContext context,
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
}
