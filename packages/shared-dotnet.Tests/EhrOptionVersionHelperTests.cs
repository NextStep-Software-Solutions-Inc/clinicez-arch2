using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Shared.Options;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests;

public class EhrOptionVersionHelperTests
{
    [Fact]
    public void ComputeOptionsSha256_IsDeterministic_RegardlessOfInputOrder()
    {
        var optionsOrderA = new List<EhrOptionDescriptor>
        {
            new() { Code = "MALE", Label = "Male", PhilHealthCode = "M", PhilHealthLibrary = "lib_sex" },
            new() { Code = "FEMALE", Label = "Female", PhilHealthCode = "F", PhilHealthLibrary = "lib_sex" },
            new() { Code = "INTERSEX", Label = "Intersex", PhilHealthCode = null, PhilHealthLibrary = "lib_sex" }
        };

        var optionsOrderB = new List<EhrOptionDescriptor>
        {
            new() { Code = "INTERSEX", Label = "Intersex", PhilHealthCode = null, PhilHealthLibrary = "lib_sex" },
            new() { Code = "MALE", Label = "Male", PhilHealthCode = "M", PhilHealthLibrary = "lib_sex" },
            new() { Code = "FEMALE", Label = "Female", PhilHealthCode = "F", PhilHealthLibrary = "lib_sex" }
        };

        var hashA = EhrOptionVersionHelper.ComputeOptionsSha256(optionsOrderA);
        var hashB = EhrOptionVersionHelper.ComputeOptionsSha256(optionsOrderB);

        hashA.Should().NotBeNullOrWhiteSpace();
        hashA.Length.Should().Be(64); // SHA-256 hex string
        hashA.Should().Be(hashB, "Sorting by Code guarantees deterministic hashes regardless of collection order.");
    }

    [Fact]
    public void ComputeManifestSha256_ChangesWhenAnyOptionChanges()
    {
        var manifestA = new Dictionary<string, IReadOnlyList<EhrOptionDescriptor>>(StringComparer.OrdinalIgnoreCase)
        {
            ["sex"] = new List<EhrOptionDescriptor>
            {
                new() { Code = "MALE", Label = "Male", PhilHealthCode = "M" }
            }
        };

        var manifestB = new Dictionary<string, IReadOnlyList<EhrOptionDescriptor>>(StringComparer.OrdinalIgnoreCase)
        {
            ["sex"] = new List<EhrOptionDescriptor>
            {
                new() { Code = "MALE", Label = "Male (Modified)", PhilHealthCode = "M" }
            }
        };

        var hashA = EhrOptionVersionHelper.ComputeManifestSha256(manifestA);
        var hashB = EhrOptionVersionHelper.ComputeManifestSha256(manifestB);

        hashA.Should().NotBe(hashB);
    }

    [Theory]
    [InlineData("\"4f8a1234\"", "4f8a1234", true)]
    [InlineData("4f8a1234", "4f8a1234", true)]
    [InlineData("W/\"4f8a1234\"", "4f8a1234", true)]
    [InlineData("\"different\"", "4f8a1234", false)]
    [InlineData("*", "4f8a1234", true)]
    [InlineData("\"oldhash\", \"4f8a1234\"", "4f8a1234", true)]
    [InlineData(null, "4f8a1234", false)]
    [InlineData("", "4f8a1234", false)]
    public void IsMatch_CorrectlyValidatesIfNoneMatchHeaders(string? ifNoneMatch, string currentVersion, bool expectedResult)
    {
        var result = EhrOptionVersionHelper.IsMatch(ifNoneMatch, currentVersion);
        result.Should().Be(expectedResult);
    }

    [Fact]
    public void EhrStaticOptions_ContainsAllRequiredSets_AndComputesValidManifestVersion()
    {
        EhrStaticOptions.AllOptionSets.Should().Contain(new[]
        {
            "sex", "gender_identity", "civil_status", "blood_type", "education_level",
            "patient_type", "assignment_status", "service_delivery_method", "verification_mode",
            "fpe_classification", "facilitator_type", "immunization_summary", "smoking_status",
            "secondhand_smoke_exposure", "vape_device", "alcohol_drinker_subtype", "alcohol_type",
            "dietary_intake", "breastfeeding_status", "dental_checkup_status", "mental_health_event",
            "sexual_consent_status", "sexual_risk_behavior", "contraceptive_use_status", "contraceptive_method",
            "prenatal_checkup_count", "pe_general_survey", "consultation_reason", "visual_acuity_chart",
            "specific_diagnosis", "counseling_topic", "diagnostic_plan_option", "routine_immunization_status",
            "vaccination_status", "milestone_visit_age", "smr_result", "headsss_education_status",
            "headsss_relationship_status", "headsss_living_arrangement", "bp_location", "recommendation_consent",
            "diagnostic_test_status", "diagnostic_test_location", "qualitative_test_result", "medicine_drug_grouping",
            "referral_type", "referral_primary_care_service", "referral_facility_service", "guardian_relationship",
            "medicine_route", "medicine_frequency", "pcu_status", "otp_status", "valid_id_type"
        });

        EhrStaticOptions.StaticManifestVersion.Should().NotBeNullOrWhiteSpace();
        EhrStaticOptions.StaticManifestVersion.Length.Should().Be(64);

        var sexVersion = EhrStaticOptions.GetOptionSetVersion("sex");
        sexVersion.Should().NotBeNullOrWhiteSpace();
        sexVersion.Length.Should().Be(64);
    }
}
