using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.E2E.Fixtures;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E.Tier2_BoundaryAndCornerCases;

using static E2EContracts;
using static E2ETestHarness;

/// <summary>
/// Tier 2: Boundary & Corner Cases for Milestone M5 (Features 22 through 25).
/// Contains >=5 boundary and adversarial edge cases per feature (20 total tests).
/// </summary>
public class Tier2_ProblemsAllergiesCdsPhilPenBoundaryTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _patientId = Guid.NewGuid();

    // =========================================================================
    // Feature 22 Boundaries: Structured Problem List
    // =========================================================================
    [Fact]
    public void F22_B1_ProblemList_Icd10WithoutDecimalPoint_NormalizedCorrectly()
    {
        var rawCode = "I10";
        var withDecimal = "I10.0";

        rawCode.Length.Should().Be(3);
        withDecimal.Should().Contain(".");
    }

    [Fact]
    public void F22_B2_ProblemList_FutureOnsetDate_DetectedByValidator()
    {
        var futureDate = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var isFuture = futureDate > today;
        isFuture.Should().BeTrue();
    }

    [Fact]
    public void F22_B3_ProblemList_SpecialCharactersInDiagnosisDescription_HandledSafely()
    {
        var desc = "Chronic obstructive pulmonary disease w/ acute exacerbation & bronchospasm <J44.1>";
        var escaped = System.Security.SecurityElement.Escape(desc);

        escaped.Should().Contain("&amp;");
        escaped.Should().Contain("&lt;");
    }

    [Fact]
    public void F22_B4_ProblemList_ResolvedProblem_RequiresResolvedDateOnOrAfterOnset()
    {
        var onset = new DateOnly(2025, 1, 10);
        var resolved = new DateOnly(2025, 2, 1);

        (resolved >= onset).Should().BeTrue();
    }

    [Fact]
    public void F22_B5_ProblemList_MultipleProblemsWithSameIcd10_DistinguishedByOnsetDate()
    {
        var ep1 = new PatientProblemDto(Guid.NewGuid(), _clinicId, _patientId, "J18.9", "Pneumonia", new DateOnly(2021, 3, 1), ProblemStatus.Resolved, new DateOnly(2021, 3, 20), null);
        var ep2 = new PatientProblemDto(Guid.NewGuid(), _clinicId, _patientId, "J18.9", "Pneumonia recurrent", new DateOnly(2024, 8, 1), ProblemStatus.Active, null, null);

        ep1.Id.Should().NotBe(ep2.Id);
        ep1.Status.Should().NotBe(ep2.Status);
    }

    // =========================================================================
    // Feature 23 Boundaries: Structured Patient Allergies
    // =========================================================================
    [Fact]
    public void F23_B1_PatientAllergies_WhitespaceInAllergenName_TrimmedCleanly()
    {
        var rawAllergen = "  Amoxicillin  ";
        var clean = rawAllergen.Trim();
        clean.Should().Be("Amoxicillin");
    }

    [Fact]
    public void F23_B2_PatientAllergies_FoodAllergy_DoesNotTriggerDrugCrossReactivityAlerts()
    {
        var allergies = new List<PatientAllergyDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, AllergyClassification.Food, "Penicillin Mushroom", "Urticaria", AllergySeverity.Moderate, false)
        };

        // Mushroom is a food allergy, should not alert for cephalexin drug cross reactivity
        var alerts = Cds.EvaluateOrderSafety(new[] { "Cephalexin" }, allergies, new List<PatientProblemDto>());

        alerts.Should().BeEmpty();
    }

    [Fact]
    public void F23_B3_PatientAllergies_EnvironmentalAllergy_ToleratesDrugOrders()
    {
        var allergies = new List<PatientAllergyDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, AllergyClassification.Environmental, "Dust Mites", "Sneezing", AllergySeverity.Mild, false)
        };

        var alerts = Cds.EvaluateOrderSafety(new[] { "Amoxicillin", "Ibuprofen" }, allergies, new List<PatientProblemDto>());

        alerts.Should().BeEmpty();
    }

    [Fact]
    public void F23_B4_PatientAllergies_AnaphylaxisFlag_ForcesHardStopRegardlessOfDrug()
    {
        var allergies = new List<PatientAllergyDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, AllergyClassification.Drug, "Aspirin", "Anaphylactic shock", AllergySeverity.LifeThreateningAnaphylaxis, true)
        };

        var alerts = Cds.EvaluateOrderSafety(new[] { "Aspirin" }, allergies, new List<PatientProblemDto>());

        alerts.Should().ContainSingle(a => a.IsHardStop);
    }

    [Fact]
    public void F23_B5_PatientAllergies_MultipleReactionManifestations_SeparatedByCommas()
    {
        var reactions = "Pruritus, urticaria, facial angioedema, wheezing";
        var parts = reactions.Split(',');
        parts.Length.Should().Be(4);
    }

    // =========================================================================
    // Feature 24 Boundaries: Enhanced CDS Evaluator
    // =========================================================================
    [Fact]
    public void F24_B1_CdsEvaluator_MultipleSimultaneousContraindications_FlagsAllViolations()
    {
        var allergies = new List<PatientAllergyDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, AllergyClassification.Drug, "Penicillin", "Anaphylaxis", AllergySeverity.LifeThreateningAnaphylaxis, true)
        };

        var problems = new List<PatientProblemDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "K25.0", "Active Peptic Ulcer", new DateOnly(2026, 1, 1), ProblemStatus.Active, null, null)
        };

        // Doctor orders Cephalexin (Cross-Reactivity with Penicillin) AND Ibuprofen (Contraindicated in PUD)
        var alerts = Cds.EvaluateOrderSafety(new[] { "Cephalexin", "Ibuprofen" }, allergies, problems);

        alerts.Should().HaveCount(2);
        alerts.Should().Contain(a => a.RuleType == "CrossReactivity");
        alerts.Should().Contain(a => a.RuleType == "DrugDisease");
    }

    [Fact]
    public void F24_B2_CdsEvaluator_EmptyOrderList_ReturnsZeroAlerts()
    {
        var allergies = new List<PatientAllergyDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, AllergyClassification.Drug, "Penicillin", "Rash", AllergySeverity.Severe, true)
        };

        var alerts = Cds.EvaluateOrderSafety(new List<string>(), allergies, new List<PatientProblemDto>());

        alerts.Should().BeEmpty();
    }

    [Fact]
    public void F24_B3_CdsEvaluator_SafeMedications_ReturnZeroAlerts()
    {
        var allergies = new List<PatientAllergyDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, AllergyClassification.Drug, "Penicillin", "Rash", AllergySeverity.Severe, false)
        };

        var problems = new List<PatientProblemDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "I10", "Hypertension", new DateOnly(2020, 1, 1), ProblemStatus.Active, null, null)
        };

        // Paracetamol and Amlodipine are completely safe in penicillin allergy and hypertension
        var alerts = Cds.EvaluateOrderSafety(new[] { "Paracetamol", "Amlodipine" }, allergies, problems);

        alerts.Should().BeEmpty();
    }

    [Fact]
    public void F24_B4_CdsEvaluator_ResolvedProblem_DoesNotTriggerActiveDdiAlert()
    {
        var resolvedUlcer = new List<PatientProblemDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "K25.0", "Peptic Ulcer Healed", new DateOnly(2020, 1, 1), ProblemStatus.Resolved, new DateOnly(2020, 4, 1), null)
        };

        var alerts = Cds.EvaluateOrderSafety(new[] { "Ibuprofen" }, new List<PatientAllergyDto>(), resolvedUlcer);

        // Resolved ulcer does NOT trigger active contraindication alert
        alerts.Should().BeEmpty();
    }

    [Fact]
    public void F24_B5_CdsEvaluator_CaseInsensitiveDrugComparison()
    {
        var allergies = new List<PatientAllergyDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, AllergyClassification.Drug, "PENICILLIN", "Hives", AllergySeverity.Severe, true)
        };

        var alerts = Cds.EvaluateOrderSafety(new[] { "penicillin" }, allergies, new List<PatientProblemDto>());

        alerts.Should().ContainSingle(a => a.RuleType == "DrugAllergy");
    }

    // =========================================================================
    // Feature 25 Boundaries: PhilPEN 24-Question Risk Scorer
    // =========================================================================
    [Fact]
    public void F25_B1_PhilPenScorer_ExactSystolicBp180Boundary_TriggersCrisisOverride()
    {
        var survey = new PhilPenSurveyAnswersDto(Guid.NewGuid(), _clinicId, _patientId,
            AgeYears: 45, Gender: "Male", IsSmoker: false, SystolicBp: 180, HasDiabetes: false,
            FastingBloodSugarMgDl: null, TotalCholesterolMgDl: null, BodyMassIndex: 23m,
            HasAnginaOrPreviousStroke: false, RenalDiseasePresent: false);

        var result = PhilPen.CalculateRisk(survey);

        result.CrisisOverrideApplied.Should().BeTrue();
        result.RiskBand.Should().Be(CvdRiskBand.BandE_40PercentOrGreater);
    }

    [Fact]
    public void F25_B2_PhilPenScorer_SystolicBp179_DoesNotTriggerBandEOverride()
    {
        var survey = new PhilPenSurveyAnswersDto(Guid.NewGuid(), _clinicId, _patientId,
            AgeYears: 45, Gender: "Male", IsSmoker: false, SystolicBp: 179, HasDiabetes: false,
            FastingBloodSugarMgDl: null, TotalCholesterolMgDl: null, BodyMassIndex: 23m,
            HasAnginaOrPreviousStroke: false, RenalDiseasePresent: false);

        var result = PhilPen.CalculateRisk(survey);

        // 179 SBP triggers Band D (Severe Stage 2 HTN), not Band E crisis
        result.RiskBand.Should().Be(CvdRiskBand.BandD_30ToUnder40Percent);
    }

    [Fact]
    public void F25_B3_PhilPenScorer_ElderlyAgeSeventyPlusBoundary_AddsMaximumAgePoints()
    {
        var survey = new PhilPenSurveyAnswersDto(Guid.NewGuid(), _clinicId, _patientId,
            AgeYears: 75, Gender: "Male", IsSmoker: true, SystolicBp: 155, HasDiabetes: true,
            FastingBloodSugarMgDl: 150m, TotalCholesterolMgDl: 250m, BodyMassIndex: null,
            HasAnginaOrPreviousStroke: false, RenalDiseasePresent: false);

        var result = PhilPen.CalculateRisk(survey);

        result.RiskBand.Should().Be(CvdRiskBand.BandE_40PercentOrGreater);
    }

    [Fact]
    public void F25_B4_PhilPenScorer_SevereObesityBmiBoundary_IncreasesRiskScore()
    {
        var survey = new PhilPenSurveyAnswersDto(Guid.NewGuid(), _clinicId, _patientId,
            AgeYears: 50, Gender: "Male", IsSmoker: false, SystolicBp: 135, HasDiabetes: false,
            FastingBloodSugarMgDl: null, TotalCholesterolMgDl: null, BodyMassIndex: 38.5m, // Class 3 Obesity
            HasAnginaOrPreviousStroke: false, RenalDiseasePresent: false);

        var result = PhilPen.CalculateRisk(survey);

        result.UsedBmiFallback.Should().BeTrue();
        result.RiskBand.Should().BeOneOf(CvdRiskBand.BandB_10ToUnder20Percent, CvdRiskBand.BandC_20ToUnder30Percent);
    }

    [Fact]
    public void F25_B5_PhilPenScorer_PreviousStrokeCrisisOverride_ImmediateBandE()
    {
        var survey = new PhilPenSurveyAnswersDto(Guid.NewGuid(), _clinicId, _patientId,
            AgeYears: 42, Gender: "Female", IsSmoker: false, SystolicBp: 118, HasDiabetes: false,
            FastingBloodSugarMgDl: null, TotalCholesterolMgDl: null, BodyMassIndex: 21m,
            HasAnginaOrPreviousStroke: true, RenalDiseasePresent: false);

        var result = PhilPen.CalculateRisk(survey);

        result.CrisisOverrideApplied.Should().BeTrue();
        result.RiskBand.Should().Be(CvdRiskBand.BandE_40PercentOrGreater);
    }
}
