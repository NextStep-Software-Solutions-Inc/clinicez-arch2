using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;

public sealed class YakapDiagnosticRequestContext
{
    public required FacilitySettings Facility { get; set; }
    public required Patient Patient { get; set; }
    public required LabOrder Order { get; set; }
    public IReadOnlyList<LabOrderItem>? Items { get; set; }
    public string? CaseNo { get; set; }
    public string? RequestingDoctorPan { get; set; }
}

/// <summary>
/// PCAPI v2.0 Wire Builder for Annex C: Diagnostic Request.
/// Converts pure 1NF laboratory order domain entities into official PhilHealth wire JSON.
/// </summary>
public sealed class YakapDiagnosticRequestWireBuilder : IYakapWireBuilder<YakapDiagnosticRequestContext, string>
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = null,
        WriteIndented = false
    };

    public Result<string> BuildWirePayload(YakapDiagnosticRequestContext context)
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

        var order = context.Order;
        var orderNo = order.OrderNumber?.Trim();
        if (string.IsNullOrWhiteSpace(orderNo))
        {
            orderNo = order.Id.ToString();
        }

        var items = context.Items ?? (IReadOnlyList<LabOrderItem>)(order.Items != null ? order.Items.ToList() : Array.Empty<LabOrderItem>());
        if (items == null || items.Count == 0)
        {
            errors.Add("Diagnostic request must contain at least one order item.");
        }

        if (errors.Count > 0)
        {
            return Result<string>.Failure(errors);
        }

        var orderDate = order.OrderDate != default
            ? order.OrderDate.ToString("yyyy-MM-dd")
            : order.CreatedAt.ToString("yyyy-MM-dd");

        var wireDict = new Dictionary<string, object?>
        {
            ["pHciAccreNo"] = accreNo,
            ["pHciCaseNo"] = context.CaseNo ?? order.PhilHealthRequestTransNo ?? context.Patient.PatientCode ?? string.Empty,
            ["pPatientPin"] = pin,
            ["pOrderNo"] = orderNo,
            ["pOrderDate"] = orderDate,
            ["pDoctorPan"] = context.RequestingDoctorPan ?? order.RequestingPhysicianPan ?? string.Empty,
            ["pClinicalIndication"] = order.Notes?.Trim() ?? order.ClinicalDiagnosis?.Trim() ?? string.Empty,
            ["pItems"] = items!.Select(item => new Dictionary<string, object?>
            {
                ["pDiagnosticCode"] = item.PhilHealthServiceCode?.Trim() ?? item.TestCode?.Trim() ?? string.Empty,
                ["pDiagnosticName"] = item.TestName?.Trim() ?? string.Empty,
                ["pUrgency"] = !string.IsNullOrWhiteSpace(item.RecommendationCode) ? item.RecommendationCode.Trim().ToUpperInvariant() : "ROUTINE",
                ["pNotes"] = item.Instructions?.Trim() ?? item.ResultRemarks?.Trim() ?? string.Empty
            }).ToList()
        };

        var json = JsonSerializer.Serialize(wireDict, JsonOpts);
        return Result<string>.Success(json);
    }

    public Result<PhilHealthEncryptedPayload> BuildEncryptedPayload(
        YakapDiagnosticRequestContext context,
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
