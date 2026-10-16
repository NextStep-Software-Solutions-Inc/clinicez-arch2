using System.Text.Json;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Patients;

public class NcdRiskAssessmentSerializationTests
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
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
}
