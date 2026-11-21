using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;

public sealed class YakapDiagnosticResultsContext
{
    public required FacilitySettings Facility { get; set; }
    public required Patient Patient { get; set; }
    public required LabOrder Order { get; set; }
    public IReadOnlyList<LabObservation> Observations { get; set; } = [];
    public IReadOnlyList<LabResult>? Results { get; set; }
    public string? CaseNo { get; set; }
    public string? DiagnosticPdfAttachmentBase64 { get; set; }
    public DateOnly? ResultDate { get; set; }
}

/// <summary>
/// PCAPI v2.0 Wire Builder for Annex D: Diagnostic Results.
/// Converts pure 1NF laboratory observation domain entities into official PhilHealth wire JSON.
/// </summary>
public sealed class YakapDiagnosticResultsWireBuilder : IYakapWireBuilder<YakapDiagnosticResultsContext, string>
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = null,
        WriteIndented = false
    };

    public Result<string> BuildWirePayload(YakapDiagnosticResultsContext context)
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

        var obsCount = context.Observations?.Count ?? 0;
        var resCount = context.Results?.Count ?? 0;
        if (obsCount == 0 && resCount == 0)
        {
            errors.Add("Diagnostic results payload must contain at least one observation or result.");
        }

        if (errors.Count > 0)
        {
            return Result<string>.Failure(errors);
        }

        var resultDate = (context.ResultDate ?? DateOnly.FromDateTime(DateTime.UtcNow)).ToString("yyyy-MM-dd");

        var wireDict = new Dictionary<string, object?>
        {
            ["pHciAccreNo"] = accreNo,
            ["pHciCaseNo"] = context.CaseNo ?? order.PhilHealthRequestTransNo ?? context.Patient.PatientCode ?? string.Empty,
            ["pPatientPin"] = pin,
            ["pOrderNo"] = orderNo,
            ["pResultDate"] = resultDate,
            ["pObservations"] = (context.Observations ?? Array.Empty<LabObservation>()).Select(obs => new Dictionary<string, object?>
            {
                ["pObservationCode"] = !string.IsNullOrWhiteSpace(obs.AnalyteCode) ? obs.AnalyteCode.Trim() : (obs.LoincCode?.Trim() ?? string.Empty),
                ["pObservationName"] = obs.AnalyteName?.Trim() ?? string.Empty,
                ["pObservationValue"] = !string.IsNullOrWhiteSpace(obs.ValueText) ? obs.ValueText.Trim() : (obs.NumericValue?.ToString() ?? string.Empty),
                ["pUnitOfMeasure"] = obs.Unit?.Trim() ?? obs.UnitSi?.Trim() ?? obs.UnitConventional?.Trim() ?? string.Empty,
                ["pReferenceRange"] = obs.ReferenceRangeText?.Trim() ?? (obs.ReferenceRangeLow.HasValue || obs.ReferenceRangeHigh.HasValue ? $"{obs.ReferenceRangeLow}-{obs.ReferenceRangeHigh}" : string.Empty),
                ["pInterpretationCode"] = obs.AbnormalFlag?.Trim() ?? "N",
                ["pPerformedAt"] = obs.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss")
            }).ToList()
        };

        if (context.Results != null && context.Results.Count > 0)
        {
            wireDict["pResults"] = context.Results.Select(r => new Dictionary<string, object?>
            {
                ["pReportId"] = r.ReportId?.ToString() ?? r.Id.ToString(),
                ["pFileName"] = r.FileName?.Trim() ?? string.Empty,
                ["pFindingSummary"] = r.ReviewRemarks?.Trim() ?? r.Notes?.Trim() ?? string.Empty,
                ["pStatus"] = r.Verification.ToString().ToUpperInvariant()
            }).ToList();
        }

        if (!string.IsNullOrWhiteSpace(context.DiagnosticPdfAttachmentBase64))
        {
            wireDict["pPdfAttachment"] = context.DiagnosticPdfAttachmentBase64.Trim();
        }

        var json = JsonSerializer.Serialize(wireDict, JsonOpts);
        return Result<string>.Success(json);
    }

    public Result<PhilHealthEncryptedPayload> BuildEncryptedPayload(
        YakapDiagnosticResultsContext context,
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
