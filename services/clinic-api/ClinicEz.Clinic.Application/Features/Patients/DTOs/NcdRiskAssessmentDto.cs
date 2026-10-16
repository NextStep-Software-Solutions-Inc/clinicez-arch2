using System;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed class BooleanOrStringYnxJsonConverter : JsonConverter<string>
{
    public override string Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.True) return "Y";
        if (reader.TokenType == JsonTokenType.False) return "N";
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.IsNullOrWhiteSpace(str)) return "N";
            var upper = str.Trim().ToUpperInvariant();
            if (upper == "TRUE") return "Y";
            if (upper == "FALSE") return "N";
            return upper;
        }
        return "N";
    }

    public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value);
    }
}

public sealed record NcdRiskAssessmentDto(
    Guid Id,
    Guid PatientId,
    Guid? ConsultationEncounterId,
    DateTime AssessmentDate,
    Guid? AssessedByStaffId,
    string? AssessedByStaffName,
    bool EatsProcessedFoodWeekly,
    bool ThreeServingsVegetablesDaily,
    bool TwoToThreeServingsFruitDaily,
    bool PhysicalActivityAtLeast150MinsWeekly,
    string DiagnosedDiabetes,
    bool HasPolyphagia,
    bool HasPolydipsia,
    bool HasPolyuria,
    string? DiabetesMedicationStatus,
    bool HasRaisedBloodGlucose,
    decimal? FastingBloodSugarMgDl,
    decimal? FastingBloodSugarMmolL,
    DateOnly? FastingBloodSugarDate,
    bool HasChestPain,
    bool PainInCenterOfChestOrLeftArm,
    bool PainWhenWalkingUphill,
    bool SlowsDownWhenPainOccurs,
    bool PainRelievedWithin10Mins,
    bool PainRelievedByNitrates,
    bool SevereChestPainOver30Mins,
    bool TransientNeurologicalDeficits,
    bool HasRaisedBloodLipids,
    decimal? TotalCholesterolMgDl,
    DateOnly? TotalCholesterolDate,
    bool HasHistoryAnginaHeartAttack,
    bool HasHistoryStrokeOrTia,
    bool UrineKetonesPresent,
    string? UrineKetonesValue,
    DateOnly? UrineKetonesDate,
    bool UrineProteinPresent,
    string? UrineProteinValue,
    DateOnly? UrineProteinDate,
    string RiskBand,
    decimal? CalculatedRiskScorePercent,
    string? Remarks,
    DateTime? CreatedAt = null,
    string? CreatedBy = null,
    DateTime? UpdatedAt = null,
    string? UpdatedBy = null,
    bool IsDeleted = false,
    DateTime? DeletedAt = null,
    string? DeletedBy = null,
    string? VoidReason = null);

public sealed record VoidNcdRiskAssessmentRequest(
    string? Reason = null);

public sealed record SaveNcdRiskAssessmentRequest(
    Guid? ConsultationEncounterId = null,
    Guid? AssessedByStaffId = null,
    string? AssessedByStaffName = null,
    bool EatsProcessedFoodWeekly = false,
    bool ThreeServingsVegetablesDaily = false,
    bool TwoToThreeServingsFruitDaily = false,
    bool PhysicalActivityAtLeast150MinsWeekly = false,
    [property: JsonConverter(typeof(BooleanOrStringYnxJsonConverter))]
    string DiagnosedDiabetes = "N",
    bool HasPolyphagia = false,
    bool HasPolydipsia = false,
    bool HasPolyuria = false,
    string? DiabetesMedicationStatus = null,
    bool HasRaisedBloodGlucose = false,
    decimal? FastingBloodSugarMgDl = null,
    decimal? FastingBloodSugarMmolL = null,
    DateOnly? FastingBloodSugarDate = null,
    bool HasChestPain = false,
    bool PainInCenterOfChestOrLeftArm = false,
    bool PainWhenWalkingUphill = false,
    bool SlowsDownWhenPainOccurs = false,
    bool PainRelievedWithin10Mins = false,
    bool PainRelievedByNitrates = false,
    bool SevereChestPainOver30Mins = false,
    bool TransientNeurologicalDeficits = false,
    bool HasRaisedBloodLipids = false,
    decimal? TotalCholesterolMgDl = null,
    DateOnly? TotalCholesterolDate = null,
    bool HasHistoryAnginaHeartAttack = false,
    bool HasHistoryStrokeOrTia = false,
    bool UrineKetonesPresent = false,
    string? UrineKetonesValue = null,
    DateOnly? UrineKetonesDate = null,
    bool UrineProteinPresent = false,
    string? UrineProteinValue = null,
    DateOnly? UrineProteinDate = null,
    string RiskBand = "BandA",
    decimal? CalculatedRiskScorePercent = null,
    string? Remarks = null,
    DateTime? AssessmentDate = null);
