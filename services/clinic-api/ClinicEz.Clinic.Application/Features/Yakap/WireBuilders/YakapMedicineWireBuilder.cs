using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;

public sealed class YakapMedicineContext
{
    public required FacilitySettings Facility { get; set; }
    public required Patient Patient { get; set; }
    public IReadOnlyList<PrescriptionItem> Items { get; set; } = [];
    public string? PrescriptionNumber { get; set; }
    public DateOnly? PrescriptionDate { get; set; }
    public string? CaseNo { get; set; }
    public string? DoctorPan { get; set; }
    public string? DoctorPrc { get; set; }
    public IPhilHealthCatalogLookup? CatalogLookup { get; set; }
}

/// <summary>
/// PCAPI v2.0 Wire Builder for Annex E: Medicine Prescription & Dispensing.
/// Converts pure 1NF prescription item domain entities into official PhilHealth wire JSON.
/// Enforces PhilHealth GAMOT Universal Product Scheme Code (UPSC, 29–30 characters).
/// </summary>
public sealed class YakapMedicineWireBuilder : IYakapWireBuilder<YakapMedicineContext, string>
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = null,
        WriteIndented = false
    };

    public Result<string> BuildWirePayload(YakapMedicineContext context)
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

        var items = context.Items;
        if (items == null || items.Count == 0)
        {
            errors.Add("Medicine payload must contain at least one prescription item.");
        }

        var validatedItems = new List<Dictionary<string, object?>>();

        if (items != null && items.Count > 0)
        {
            foreach (var item in items)
            {
                var upscCode = ResolveUpscCode(item, context.CatalogLookup);
                if (string.IsNullOrWhiteSpace(upscCode) || upscCode.Length < 29 || upscCode.Length > 30)
                {
                    errors.Add($"Prescription item '{item.GenericName}' does not have a valid 29-30 character GAMOT UPSC drug code.");
                }

                validatedItems.Add(new Dictionary<string, object?>
                {
                    ["pDrugCode"] = upscCode ?? string.Empty,
                    ["pGenericName"] = item.GenericName?.Trim() ?? string.Empty,
                    ["pBrandName"] = item.BrandName?.Trim() ?? string.Empty,
                    ["pDosageStrength"] = item.Dosage?.Trim() ?? string.Empty,
                    ["pDosageForm"] = item.Form?.Trim() ?? string.Empty,
                    ["pQuantity"] = item.Quantity,
                    ["pFrequency"] = item.Frequency?.Trim() ?? "OD",
                    ["pDurationDays"] = item.DurationDays,
                    ["pInstructions"] = item.Sig?.Trim() ?? item.Remarks?.Trim() ?? string.Empty,
                    ["pDispensedQuantity"] = item.DispensedQuantity ?? item.Quantity,
                    ["pIsSpecialOrder"] = item.IsDangerousDrug
                });
            }
        }

        if (errors.Count > 0)
        {
            return Result<string>.Failure(errors);
        }

        var rxDate = (context.PrescriptionDate ?? items?.FirstOrDefault()?.PrescriptionDate ?? DateOnly.FromDateTime(DateTime.UtcNow)).ToString("yyyy-MM-dd");
        var rxNo = context.PrescriptionNumber ?? items?.FirstOrDefault()?.UniquePrescriptionSecurityCode ?? items?.FirstOrDefault()?.Id.ToString() ?? Guid.NewGuid().ToString();

        var wireDict = new Dictionary<string, object?>
        {
            ["pHciAccreNo"] = accreNo,
            ["pHciCaseNo"] = context.CaseNo ?? context.Patient.PatientCode ?? string.Empty,
            ["pPatientPin"] = pin,
            ["pPrescriptionNo"] = rxNo,
            ["pPrescriptionDate"] = rxDate,
            ["pDoctorPan"] = context.DoctorPan ?? string.Empty,
            ["pDoctorPrc"] = context.DoctorPrc ?? items?.FirstOrDefault()?.PrescribingPhysicianPrcNo ?? string.Empty,
            ["pItems"] = validatedItems
        };

        var json = JsonSerializer.Serialize(wireDict, JsonOpts);
        return Result<string>.Success(json);
    }

    public Result<PhilHealthEncryptedPayload> BuildEncryptedPayload(
        YakapMedicineContext context,
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

    private static string? ResolveUpscCode(PrescriptionItem item, IPhilHealthCatalogLookup? lookup)
    {
        if (!string.IsNullOrWhiteSpace(item.PhilHealthDrugCode) &&
            item.PhilHealthDrugCode.Length >= 29 &&
            item.PhilHealthDrugCode.Length <= 30)
        {
            return item.PhilHealthDrugCode.Trim();
        }

        if (lookup != null && !string.IsNullOrWhiteSpace(item.GenericName))
        {
            var match = lookup.FindByDescription("lib_drugs", item.GenericName)
                ?? lookup.FindByDescription("lib_medicines", item.GenericName);

            var code = match?.Code;
            if (!string.IsNullOrWhiteSpace(code) && code.Length >= 29 && code.Length <= 30)
            {
                return code.Trim();
            }
        }

        return item.PhilHealthDrugCode?.Trim();
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
