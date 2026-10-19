using System.Text.Json;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Patients;

public class NcdRiskAssessmentSerializationTests
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    [Theory]
    [InlineData("{\"diagnosedDiabetes\": true}", "Y")]
    [InlineData("{\"diagnosedDiabetes\": false}", "N")]
    [InlineData("{\"diagnosedDiabetes\": \"Y\"}", "Y")]
    [InlineData("{\"diagnosedDiabetes\": \"N\"}", "N")]
    [InlineData("{\"diagnosedDiabetes\": \"X\"}", "X")]
    [InlineData("{\"diagnosedDiabetes\": \"true\"}", "Y")]
    [InlineData("{\"diagnosedDiabetes\": \"false\"}", "N")]
    [InlineData("{\"diagnosedDiabetes\": \"\"}", "N")]
    [InlineData("{}", "N")]
    public void Deserializes_DiagnosedDiabetes_Correctly(string json, string expected)
    {
        var result = JsonSerializer.Deserialize<SaveNcdRiskAssessmentRequest>(json, JsonOptions);

        Assert.NotNull(result);
        Assert.Equal(expected, result.DiagnosedDiabetes);
    }

    [Fact]
    public void FullPayloadWithBooleanDiagnosedDiabetes_DeserializesSuccessfully()
    {
        var json = """
        {
            "riskBand": "BandA",
            "calculatedRiskScorePercent": 6.5,
            "assessedByStaffName": "Nurse Joy",
            "remarks": "Low risk assessment",
            "eatsProcessedFoodWeekly": false,
            "threeServingsVegetablesDaily": true,
            "twoToThreeServingsFruitDaily": true,
            "physicalActivityAtLeast150MinsWeekly": true,
            "diagnosedDiabetes": false,
            "hasPolyphagia": false,
            "hasPolydipsia": false,
            "hasPolyuria": false,
            "diabetesMedicationStatus": "N",
            "hasRaisedBloodGlucose": false,
            "hasChestPain": false,
            "painInCenterOfChestOrLeftArm": false,
            "painWhenWalkingUphill": false,
            "slowsDownWhenPainOccurs": false,
            "painRelievedWithin10Mins": false,
            "painRelievedByNitrates": false,
            "severeChestPainOver30Mins": false,
            "transientNeurologicalDeficits": false,
            "hasHistoryAnginaHeartAttack": false,
            "hasHistoryStrokeOrTia": false,
            "hasRaisedBloodLipids": false,
            "urineKetonesPresent": false,
            "urineKetonesValue": "Negative",
            "urineProteinPresent": false,
            "urineProteinValue": "Negative"
        }
        """;

        var result = JsonSerializer.Deserialize<SaveNcdRiskAssessmentRequest>(json, JsonOptions);

        Assert.NotNull(result);
        Assert.Equal("N", result.DiagnosedDiabetes);
        Assert.Equal("BandA", result.RiskBand);
        Assert.Equal(6.5m, result.CalculatedRiskScorePercent);
        Assert.Equal("Nurse Joy", result.AssessedByStaffName);
    }

    [Fact]
    public void Deserializes_AssessmentDate_WhenProvided()
    {
        var json = """
        {
            "assessmentDate": "2026-10-16T08:30:00Z",
            "assessedByStaffName": "Dr. Santos"
        }
        """;

        var result = JsonSerializer.Deserialize<SaveNcdRiskAssessmentRequest>(json, JsonOptions);

        Assert.NotNull(result);
        Assert.Equal("Dr. Santos", result.AssessedByStaffName);
        Assert.NotNull(result.AssessmentDate);
        Assert.Equal(2026, result.AssessmentDate.Value.Year);
        Assert.Equal(10, result.AssessmentDate.Value.Month);
        Assert.Equal(16, result.AssessmentDate.Value.Day);
    }

    [Fact]
    public void NcdRiskAssessmentDto_Serializes_AssessmentDate_And_CreatedAt()
    {
        var assessmentDate = new DateTime(2026, 10, 16, 8, 30, 0, DateTimeKind.Utc);
        var createdAt = new DateTime(2026, 10, 16, 8, 35, 0, DateTimeKind.Utc);

        var dto = new NcdRiskAssessmentDto(
            Id: Guid.NewGuid(),
            PatientId: Guid.NewGuid(),
            ConsultationEncounterId: null,
            AssessmentDate: assessmentDate,
            AssessedByStaffId: null,
            AssessedByStaffName: "Dr. Santos",
            EatsProcessedFoodWeekly: false,
            ThreeServingsVegetablesDaily: true,
            TwoToThreeServingsFruitDaily: true,
            PhysicalActivityAtLeast150MinsWeekly: true,
            DiagnosedDiabetes: "N",
            HasPolyphagia: false,
            HasPolydipsia: false,
            HasPolyuria: false,
            DiabetesMedicationStatus: null,
            HasRaisedBloodGlucose: false,
            FastingBloodSugarMgDl: null,
            FastingBloodSugarMmolL: null,
            FastingBloodSugarDate: null,
            HasChestPain: false,
            PainInCenterOfChestOrLeftArm: false,
            PainWhenWalkingUphill: false,
            SlowsDownWhenPainOccurs: false,
            PainRelievedWithin10Mins: false,
            PainRelievedByNitrates: false,
            SevereChestPainOver30Mins: false,
            TransientNeurologicalDeficits: false,
            HasRaisedBloodLipids: false,
            TotalCholesterolMgDl: null,
            TotalCholesterolDate: null,
            HasHistoryAnginaHeartAttack: false,
            HasHistoryStrokeOrTia: false,
            UrineKetonesPresent: false,
            UrineKetonesValue: null,
            UrineKetonesDate: null,
            UrineProteinPresent: false,
            UrineProteinValue: null,
            UrineProteinDate: null,
            RiskBand: "BandA",
            CalculatedRiskScorePercent: 5.0m,
            Remarks: "Normal",
            CreatedAt: createdAt);

        var json = JsonSerializer.Serialize(dto, JsonOptions);

        Assert.Contains("assessmentDate", json);
        Assert.Contains("createdAt", json);
        Assert.Contains("Dr. Santos", json);
    }
}
