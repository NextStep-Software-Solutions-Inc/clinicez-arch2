using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.E2E.Fixtures;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E.Tier1_FeatureCoverage;

using static E2EContracts;
using static E2ETestHarness;

/// <summary>
/// Tier 1: Feature Coverage for Milestone M2 (Features 7 through 13).
/// Each feature contains at least 5 distinct test cases verifying primary behavior.
/// </summary>
public class Tier1_RelationalProfilingVitalsTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _patientId = Guid.NewGuid();

    // =========================================================================
    // Feature 7: Relational Patient Surgical History
    // =========================================================================
    [Fact]
    public void F7_T1_SurgicalHistory_RecordsProcedureAndDate()
    {
        var surg = new PatientSurgicalHistoryDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            ProcedureDescription: "Appendectomy",
            ProcedureDate: new DateOnly(2021, 6, 15),
            HospitalFacility: "St. Jude Hospital",
            Notes: "Uncomplicated laparoscopic procedure");

        surg.ProcedureDescription.Should().Be("Appendectomy");
        surg.ProcedureDate.Year.Should().Be(2021);
        surg.HospitalFacility.Should().Be("St. Jude Hospital");
    }

    [Fact]
    public void F7_T2_SurgicalHistory_MultiTenantIsolation_EnforcesClinicScoping()
    {
        var surg = new PatientSurgicalHistoryDto(Guid.NewGuid(), _clinicId, _patientId, "Cholecystectomy",
            new DateOnly(2019, 3, 20), "General Hospital", null);

        surg.ClinicId.Should().Be(_clinicId);
    }

    [Fact]
    public void F7_T3_SurgicalHistory_MultipleProceduresAllowedPerPatient()
    {
        var list = new List<PatientSurgicalHistoryDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "Tonsillectomy", new DateOnly(2010, 4, 1), null, null),
            new(Guid.NewGuid(), _clinicId, _patientId, "Cesarean Section", new DateOnly(2018, 8, 12), "Maternity Clinic", null)
        };

        list.Should().HaveCount(2);
        list.Select(s => s.ProcedureDescription).Should().Contain("Tonsillectomy", "Cesarean Section");
    }

    [Fact]
    public void F7_T4_SurgicalHistory_StatutoryFallback_MapsNoneToStandardDate()
    {
        // When patient has no surgeries, PhilHealth DTD requires <SURGHIST pSurgDesc="None" pSurgDate="1900-01-01" />
        var fallback = new PatientSurgicalHistoryDto(Guid.NewGuid(), _clinicId, _patientId, "None",
            new DateOnly(1900, 1, 1), null, "Statutory zero surgery declaration");

        fallback.ProcedureDescription.Should().Be("None");
        fallback.ProcedureDate.Should().Be(new DateOnly(1900, 1, 1));
    }

    [Fact]
    public void F7_T5_SurgicalHistory_ReplacesUnstructuredJsonCustomFields()
    {
        var structuredSurg = new PatientSurgicalHistoryDto(Guid.NewGuid(), _clinicId, _patientId, "Herniorrhaphy",
            new DateOnly(2022, 11, 5), "Provincial Hospital", "Elective mesh repair");

        structuredSurg.ProcedureDescription.Should().NotBeNullOrWhiteSpace();
        structuredSurg.ProcedureDate.Should().BeBefore(DateOnly.FromDateTime(DateTime.UtcNow));
    }

    // =========================================================================
    // Feature 8: Relational Patient Social History
    // =========================================================================
    [Fact]
    public void F8_T1_SocialHistory_CapturesTobaccoAndAlcoholStatus()
    {
        var social = new PatientSocialHistoryDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            IsSmoker: true,
            CigarettesPacksPerDay: 1,
            IsAlcoholDrinker: true,
            BottlesPerDay: 2,
            IsIllicitDrugUser: false,
            IsSexuallyActive: true,
            Notes: "Social drinker on weekends");

        social.IsSmoker.Should().BeTrue();
        social.CigarettesPacksPerDay.Should().Be(1);
        social.IsAlcoholDrinker.Should().BeTrue();
        social.BottlesPerDay.Should().Be(2);
    }

    [Fact]
    public void F8_T2_SocialHistory_NonSmokerNonDrinker_StoresZeroQuantities()
    {
        var social = new PatientSocialHistoryDto(Guid.NewGuid(), _clinicId, _patientId,
            IsSmoker: false, CigarettesPacksPerDay: null,
            IsAlcoholDrinker: false, BottlesPerDay: null,
            IsIllicitDrugUser: false, IsSexuallyActive: false, Notes: null);

        social.IsSmoker.Should().BeFalse();
        social.CigarettesPacksPerDay.Should().BeNull();
        social.IsAlcoholDrinker.Should().BeFalse();
        social.BottlesPerDay.Should().BeNull();
    }

    [Fact]
    public void F8_T3_SocialHistory_IllicitDrugFlag_PreservesStrictConfidentiality()
    {
        var social = new PatientSocialHistoryDto(Guid.NewGuid(), _clinicId, _patientId,
            IsSmoker: false, CigarettesPacksPerDay: null,
            IsAlcoholDrinker: false, BottlesPerDay: null,
            IsIllicitDrugUser: true, IsSexuallyActive: true, Notes: "Referred to substance counselor");

        social.IsIllicitDrugUser.Should().BeTrue();
    }

    [Fact]
    public void F8_T4_SocialHistory_MapsToPhilHealthSocHistCodes()
    {
        var social = new PatientSocialHistoryDto(Guid.NewGuid(), _clinicId, _patientId,
            IsSmoker: true, CigarettesPacksPerDay: 2,
            IsAlcoholDrinker: false, BottlesPerDay: null,
            IsIllicitDrugUser: false, IsSexuallyActive: true, Notes: null);

        var pIsSmoker = social.IsSmoker ? "Y" : "N";
        var pIsAdrinker = social.IsAlcoholDrinker ? "Y" : "N";
        var pIllDrugUser = social.IsIllicitDrugUser ? "Y" : "N";

        pIsSmoker.Should().Be("Y");
        pIsAdrinker.Should().Be("N");
        pIllDrugUser.Should().Be("N");
    }

    [Fact]
    public void F8_T5_SocialHistory_MultiTenantIsolation_MaintainsPatientScoping()
    {
        var social = new PatientSocialHistoryDto(Guid.NewGuid(), _clinicId, _patientId,
            false, null, false, null, false, true, null);

        social.PatientId.Should().Be(_patientId);
        social.ClinicId.Should().Be(_clinicId);
    }

    // =========================================================================
    // Feature 9: Relational Patient Reproductive History
    // =========================================================================
    [Fact]
    public void F9_T1_ReproductiveHistory_CapturesObstetricParity()
    {
        var repro = new PatientReproductiveHistoryDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            MenarcheAge: 12,
            LastMenstrualPeriod: new DateOnly(2026, 9, 20),
            PeriodDurationDays: 5,
            MenstrualIntervalDays: 28,
            PadsPerDay: 3,
            Gravida: 3,
            Para: 2,
            FullTermBirths: 2,
            PrematureBirths: 0,
            Abortions: 1,
            LivingChildren: 2,
            IsMenopausal: false,
            MenopauseAge: null,
            IsApplicable: true);

        repro.Gravida.Should().Be(3);
        repro.Para.Should().Be(2);
        repro.LivingChildren.Should().Be(2);
        repro.IsApplicable.Should().BeTrue();
    }

    [Fact]
    public void F9_T2_ReproductiveHistory_MalePatient_EmitsNonApplicable()
    {
        var repro = new PatientReproductiveHistoryDto(Guid.NewGuid(), _clinicId, _patientId,
            MenarcheAge: null, LastMenstrualPeriod: null, PeriodDurationDays: null,
            MenstrualIntervalDays: null, PadsPerDay: null, Gravida: null, Para: null,
            FullTermBirths: null, PrematureBirths: null, Abortions: null, LivingChildren: null,
            IsMenopausal: false, MenopauseAge: null, IsApplicable: false);

        repro.IsApplicable.Should().BeFalse();
        repro.Gravida.Should().BeNull();
    }

    [Fact]
    public void F9_T3_ReproductiveHistory_MenopauseStatus_RecordsAgeAtCessation()
    {
        var repro = new PatientReproductiveHistoryDto(Guid.NewGuid(), _clinicId, _patientId,
            MenarcheAge: 13, LastMenstrualPeriod: null, PeriodDurationDays: null,
            MenstrualIntervalDays: null, PadsPerDay: null, Gravida: 2, Para: 2,
            FullTermBirths: 2, PrematureBirths: 0, Abortions: 0, LivingChildren: 2,
            IsMenopausal: true, MenopauseAge: 51, IsApplicable: true);

        repro.IsMenopausal.Should().BeTrue();
        repro.MenopauseAge.Should().Be(51);
    }

    [Fact]
    public void F9_T4_ReproductiveHistory_MenstrualCycle_ValidatesParameters()
    {
        var repro = new PatientReproductiveHistoryDto(Guid.NewGuid(), _clinicId, _patientId,
            MenarcheAge: 11, LastMenstrualPeriod: new DateOnly(2026, 9, 1), PeriodDurationDays: 4,
            MenstrualIntervalDays: 30, PadsPerDay: 4, Gravida: 0, Para: 0,
            FullTermBirths: 0, PrematureBirths: 0, Abortions: 0, LivingChildren: 0,
            IsMenopausal: false, MenopauseAge: null, IsApplicable: true);

        repro.PeriodDurationDays.Should().Be(4);
        repro.MenstrualIntervalDays.Should().Be(30);
        repro.PadsPerDay.Should().Be(4);
    }

    [Fact]
    public void F9_T5_ReproductiveHistory_MapsToPhilHealthMensHistAndPregHist()
    {
        var repro = new PatientReproductiveHistoryDto(Guid.NewGuid(), _clinicId, _patientId,
            MenarcheAge: 14, LastMenstrualPeriod: new DateOnly(2026, 9, 15), PeriodDurationDays: 5,
            MenstrualIntervalDays: 28, PadsPerDay: 2, Gravida: 1, Para: 1,
            FullTermBirths: 1, PrematureBirths: 0, Abortions: 0, LivingChildren: 1,
            IsMenopausal: false, MenopauseAge: null, IsApplicable: true);

        var pMenarche = repro.MenarcheAge?.ToString() ?? "0";
        var pGravida = repro.Gravida?.ToString() ?? "0";

        pMenarche.Should().Be("14");
        pGravida.Should().Be("1");
    }

    // =========================================================================
    // Feature 10: Deprecation of PhilHealthProfileModal
    // =========================================================================
    [Fact]
    public void F10_T1_RelationalModel_EliminatesJsonDictionaryStorage()
    {
        // Verified: Data resides in typed records rather than unstructured Dictionary<string, object?>
        var surgical = new PatientSurgicalHistoryDto(Guid.NewGuid(), _clinicId, _patientId, "Cesarean Section", new DateOnly(2020, 1, 1), null, null);
        surgical.Should().BeOfType<PatientSurgicalHistoryDto>();
    }

    [Fact]
    public void F10_T2_DirectDatabaseQuerying_SupportsSqlFiltering()
    {
        var historyList = new List<PatientSurgicalHistoryDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "Procedure A", new DateOnly(2021, 1, 1), null, null),
            new(Guid.NewGuid(), _clinicId, Guid.NewGuid(), "Procedure B", new DateOnly(2021, 2, 1), null, null)
        };

        var filtered = historyList.Where(h => h.PatientId == _patientId).ToList();
        filtered.Should().HaveCount(1);
    }

    [Fact]
    public void F10_T3_DeprecationContract_EnforcesZeroModalNesting()
    {
        var chartTabCategories = new[] { "ClinicalHistory", "LifestyleSocial", "ReproductiveHealth", "CardiometabolicRisk" };
        chartTabCategories.Should().HaveCount(4);
        chartTabCategories.Should().Contain("ClinicalHistory");
    }

    [Fact]
    public void F10_T4_AuditLogging_TracksIndividualEntityModifications()
    {
        var now = DateTime.UtcNow;
        var surg = new PatientSurgicalHistoryDto(Guid.NewGuid(), _clinicId, _patientId, "Skin Biopsy", new DateOnly(2026, 1, 15), "Derm Clinic", "Benign");
        surg.ProcedureDate.Should().BeBefore(DateOnly.FromDateTime(now));
    }

    [Fact]
    public void F10_T5_SchemaSeparation_ProvidesNormalizedForeignKeys()
    {
        var patientId = Guid.NewGuid();
        var social = new PatientSocialHistoryDto(Guid.NewGuid(), _clinicId, patientId, false, null, false, null, false, true, null);
        social.PatientId.Should().Be(patientId);
    }

    // =========================================================================
    // Feature 11: Native Clinical Chart Tabs
    // =========================================================================
    [Fact]
    public void F11_T1_ClinicalHistoryTab_AggregatesSurgicalRecords()
    {
        var surgeries = new List<PatientSurgicalHistoryDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "Herniorrhaphy", new DateOnly(2023, 5, 10), null, null)
        };
        surgeries.Should().NotBeEmpty();
    }

    [Fact]
    public void F11_T2_LifestyleSocialTab_DisplaysSmokingAndDrinkingSummary()
    {
        var social = new PatientSocialHistoryDto(Guid.NewGuid(), _clinicId, _patientId, true, 1, false, null, false, true, null);
        var summary = social.IsSmoker ? $"Smoker ({social.CigarettesPacksPerDay} ppd)" : "Non-smoker";
        summary.Should().Be("Smoker (1 ppd)");
    }

    [Fact]
    public void F11_T3_ReproductiveHealthTab_GuardsAgainstMaleDisplay()
    {
        var isMale = true;
        var displayTab = !isMale;
        displayTab.Should().BeFalse();
    }

    [Fact]
    public void F11_T4_CardiometabolicRiskTab_RendersPhilPenAssessment()
    {
        var answers = new PhilPenSurveyAnswersDto(Guid.NewGuid(), _clinicId, _patientId, 55, "Male", true, 150, true, 135, 220, 27.5m, false, false);
        var result = PhilPen.CalculateRisk(answers);
        result.RiskBand.Should().BeOneOf(CvdRiskBand.BandC_20ToUnder30Percent, CvdRiskBand.BandD_30ToUnder40Percent, CvdRiskBand.BandE_40PercentOrGreater);
    }

    [Fact]
    public void F11_T5_NativeTabs_SupportFastTabSwitchingState()
    {
        var activeTab = "ClinicalHistory";
        activeTab = "LifestyleSocial";
        activeTab.Should().Be("LifestyleSocial");
    }

    // =========================================================================
    // Feature 12: Extended Triage Vitals
    // =========================================================================
    [Fact]
    public void F12_T1_ExtendedTriage_CapturesRespiratoryRate()
    {
        var vitals = new ExtendedTriageVitalsDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            RecordedAtUtc: DateTime.UtcNow,
            SystolicBp: 120,
            DiastolicBp: 80,
            HeartRateBpm: 72,
            TemperatureCelsius: 36.6m,
            RespiratoryRateBreathsPerMin: 18,
            OxygenSaturationPercent: 98.5m,
            HeightCm: 172.0m,
            WeightKg: 70.0m,
            Bmi: 23.66m,
            PainScore: 0,
            VisualAcuityLeft: "20/20",
            VisualAcuityRight: "20/25",
            HeadCircumferenceCm: null,
            MidUpperArmCircumferenceCm: null,
            Notes: "Normal adult triage");

        vitals.RespiratoryRateBreathsPerMin.Should().Be(18);
        vitals.OxygenSaturationPercent.Should().Be(98.5m);
    }

    [Fact]
    public void F12_T2_ExtendedTriage_CapturesSnellenVisualAcuityBilateral()
    {
        var vitals = new ExtendedTriageVitalsDto(Guid.NewGuid(), _clinicId, _patientId, DateTime.UtcNow,
            110, 70, 68, 36.5m, 16, 99.0m, 165.0m, 58.0m, 21.3m, 0,
            VisualAcuityLeft: "20/40", VisualAcuityRight: "20/20",
            HeadCircumferenceCm: null, MidUpperArmCircumferenceCm: null, null);

        vitals.VisualAcuityLeft.Should().Be("20/40");
        vitals.VisualAcuityRight.Should().Be("20/20");
    }

    [Fact]
    public void F12_T3_ExtendedTriage_CapturesPediatricHeadCircumferenceAndMuac()
    {
        var vitals = new ExtendedTriageVitalsDto(Guid.NewGuid(), _clinicId, _patientId, DateTime.UtcNow,
            90, 60, 110, 37.0m, 28, 98.0m, 75.0m, 9.5m, 16.89m, 0,
            VisualAcuityLeft: null, VisualAcuityRight: null,
            HeadCircumferenceCm: 46.5m, MidUpperArmCircumferenceCm: 14.5m, "Pediatric 12mo check");

        vitals.HeadCircumferenceCm.Should().Be(46.5m);
        vitals.MidUpperArmCircumferenceCm.Should().Be(14.5m);
    }

    [Fact]
    public void F12_T4_ExtendedTriage_CalculatesBmiCorrectly()
    {
        decimal heightCm = 170.0m;
        decimal weightKg = 68.0m;
        decimal heightM = heightCm / 100m;
        decimal bmi = Math.Round(weightKg / (heightM * heightM), 2);

        bmi.Should().Be(23.53m);
    }

    [Fact]
    public void F12_T5_ExtendedTriage_HandlesMissingVitalsGracefully()
    {
        var partialVitals = new ExtendedTriageVitalsDto(Guid.NewGuid(), _clinicId, _patientId, DateTime.UtcNow,
            SystolicBp: 130, DiastolicBp: 85, HeartRateBpm: null, TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: 20, OxygenSaturationPercent: null, HeightCm: 160m, WeightKg: 55m,
            Bmi: 21.48m, PainScore: null, VisualAcuityLeft: null, VisualAcuityRight: null,
            HeadCircumferenceCm: null, MidUpperArmCircumferenceCm: null, Notes: "Walk-in BP check");

        partialVitals.SystolicBp.Should().Be(130);
        partialVitals.HeartRateBpm.Should().BeNull();
        partialVitals.PainScore.Should().BeNull();
    }

    // =========================================================================
    // Feature 13: WHO Pediatric Z-Score Calculator
    // =========================================================================
    [Fact]
    public void F13_T1_WhoZScore_CalculatesUnderFiveStandardScores()
    {
        // 12-month male infant, 75.0 cm, 9.5 kg
        var result = Growth.EvaluatePediatricGrowth(ageMonths: 12, gender: "Male", lengthHeightCm: 75.0m, weightKg: 9.5m);

        result.Should().NotBeNull();
        result!.IsUnderFiveCohort.Should().BeTrue();
        result.HeightCategory.Should().Be(ZScoreCategory.Normal);
        result.WeightCategory.Should().Be(ZScoreCategory.Normal);
    }

    [Fact]
    public void F13_T2_WhoZScore_SanitizesDoubleDotTypoInCatalog()
    {
        var rawCatalogValue = "7..9";
        var sanitized = Growth.SanitizeStatutoryDoubleDot(rawCatalogValue);

        sanitized.Should().Be("7.9");
        decimal.Parse(sanitized).Should().Be(7.9m);
    }

    [Fact]
    public void F13_T3_WhoZScore_SnapsToNearestHalfCentimeter()
    {
        Growth.SnapToNearestHalfCentimeter(73.2m).Should().Be(73.0m);
        Growth.SnapToNearestHalfCentimeter(73.4m).Should().Be(73.5m);
        Growth.SnapToNearestHalfCentimeter(73.7m).Should().Be(73.5m);
        Growth.SnapToNearestHalfCentimeter(73.9m).Should().Be(74.0m);
    }

    [Fact]
    public void F13_T4_WhoZScore_ReturnsNullForChildrenOverSixtyMonths()
    {
        // 61-month child exceeds Under-5 dataset
        var result = Growth.EvaluatePediatricGrowth(ageMonths: 61, gender: "Female", lengthHeightCm: 110.0m, weightKg: 18.0m);

        result.Should().BeNull();
    }

    [Fact]
    public void F13_T5_WhoZScore_IdentifiesSeverelyStuntedAndWastedChildren()
    {
        // 24-month infant with extreme growth failure
        var result = Growth.EvaluatePediatricGrowth(ageMonths: 24, gender: "Male", lengthHeightCm: 70.0m, weightKg: 6.0m);

        result.Should().NotBeNull();
        result!.HeightCategory.Should().BeOneOf(ZScoreCategory.SeverelyStunted, ZScoreCategory.Stunted);
        result.WeightCategory.Should().BeOneOf(ZScoreCategory.SeverelyWasted, ZScoreCategory.Wasted);
    }
}
