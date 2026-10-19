using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using FluentAssertions;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>The resolver must only ever emit codes that exist in the PhilHealth Catalog.</summary>
public class PhilHealthCatalogResolverTests
{
    private static readonly PhilHealthCatalogLookup Catalog = PhilHealthCatalogLookup.FromBundledSeed();
    private readonly PhilHealthCatalogResolver _resolver = new(Catalog);

    [Theory]
    [InlineData("Hypertension", "011")]
    [InlineData("HTN, on losartan", "011")]
    [InlineData("type 2 diabetes", "006")]
    [InlineData("Bronchial asthma", "002")]
    [InlineData("Urinary tract infection", "017")]
    [InlineData("pulmonary tuberculosis", "015")]
    [InlineData("extrapulmonary TB", "016")]
    [InlineData("COPD", "007")]
    public void Conditions_resolve_to_official_mdisease_codes(string text, string expectedCode)
    {
        var (histories, specifics) = _resolver.ResolveMedicalHistories(text);

        histories.Select(h => h.MdiseaseCode).Should().Contain(expectedCode);
        Catalog.Find("lib_mdiseases", expectedCode).Should().NotBeNull();
        specifics.Should().OnlyContain(s => Catalog.Find("lib_mdiseases", s.MdiseaseCode) != null);
    }

    [Fact]
    public void Negated_and_unrecorded_conditions_map_to_the_catalog_none_entry()
    {
        var none = Catalog.FindByDescription("lib_mdiseases", "None")!.Code;

        _resolver.ResolveMedicalHistories("denies hypertension").Histories.Select(h => h.MdiseaseCode).Should().Equal(none);
        _resolver.ResolveMedicalHistories(null).Histories.Select(h => h.MdiseaseCode).Should().Equal(none);
    }

    [Fact]
    public void Uncatalogued_conditions_map_to_the_catalog_others_entry()
    {
        var others = Catalog.FindByDescription("lib_mdiseases", "Others")!.Code;

        var (histories, specifics) = _resolver.ResolveMedicalHistories("migraine with aura");

        histories.Single().MdiseaseCode.Should().Be(others);
        specifics.Single().SpecificDesc.Should().Be("migraine with aura");
    }

    [Fact]
    public void Without_a_loaded_catalog_no_code_is_invented()
    {
        var resolver = new PhilHealthCatalogResolver(PhilHealthCatalogLookup.FromFiles([]));

        resolver.ResolveMedicalHistories("hypertension").Histories.Should().BeEmpty();
        resolver.ResolveDiagnosticCode("CBC").Should().BeEmpty();
        resolver.ResolveKnownConditions("hypertension").Should().BeEmpty();
    }

    [Fact]
    public void Explicitly_selected_conditions_are_kept_as_chosen()
    {
        var chosen = new List<ClinicEz.Clinic.Application.Features.Yakap.DTOs.PhilHealthConditionEntryDto> { new("006", "Diabetes Mellitus (type 2)") };

        var (histories, specifics) = _resolver.ResolveMedicalHistories("hypertension", chosen);

        histories.Select(h => h.MdiseaseCode).Should().Equal("006");
        specifics.Single().SpecificDesc.Should().Be("Diabetes Mellitus (type 2)");
    }

    [Fact]
    public void Known_conditions_for_profile_prefill_carry_official_descriptions()
    {
        var known = _resolver.ResolveKnownConditions("Hypertension; denies diabetes; asthma");

        known.Select(k => k.Code).Should().BeEquivalentTo("011", "002");
        known.Single(k => k.Code == "011").SpecificDesc.Should().Be(Catalog.Find("lib_mdiseases", "011")!.Description);
    }

    [Theory]
    [InlineData("CBC", "Complete Blood Count")]
    [InlineData("Chest X-ray PA", "Chest X-Ray")]
    [InlineData("Sputum AFB smear", "Sputum Microscopy")]
    [InlineData("Fasting blood sugar", "Fasting Blood Sugar")]
    [InlineData("Lipid profile", "Lipid Profile")]
    [InlineData("12-lead ECG", "Electrocardiogram (ECG)")]
    [InlineData("HbA1c", "HbA1c")]
    public void Lab_orders_resolve_to_official_diagnostic_codes(string testName, string expectedDescription)
    {
        var code = _resolver.ResolveDiagnosticCode(testName);

        Catalog.Find("lib_diagnostic", code)!.Description.Should().Be(expectedDescription);
    }

    [Fact]
    public void Unknown_or_blank_tests_resolve_to_the_catalog_others_entry()
    {
        var others = Catalog.FindByDescription("lib_diagnostic", "Others")!.Code;

        _resolver.ResolveDiagnosticCode("Zinc level").Should().Be(others);
        _resolver.ResolveDiagnosticCode(null).Should().Be(others);
        _resolver.OtherDiagnosticCode().Should().Be(others);
    }

    [Fact]
    public void Visual_inspection_with_acetic_acid_is_not_mistaken_for_a_pap_smear()
    {
        var code = _resolver.ResolveDiagnosticCode("VIA - visual inspection with acetic acid");

        Catalog.Find("lib_diagnostic", code)!.Description.Should().Be("Others");
    }

    [Theory]
    [InlineData("Amlodipine", "5 mg", "AMLODIPINE 5 mg")]
    [InlineData("Losartan 50 mg", null, "LOSARTAN")]
    [InlineData("Metformin", "500 mg", "METFORMIN")]
    public void Medicines_resolve_to_official_lib_medicine_codes(string generic, string? dosage, string expectedDescriptionPrefix)
    {
        var code = _resolver.ResolveDrugCode(generic, dosage);

        code.Should().HaveLength(30);
        var entry = Catalog.Find("lib_medicine", code);
        entry.Should().NotBeNull($"'{generic}' should resolve to a real catalog code, got {code}");
        entry!.Description.ToUpperInvariant().Should().Contain(expectedDescriptionPrefix.ToUpperInvariant());
    }

    [Fact]
    public void Strength_must_match_as_a_whole_number()
    {
        var code = _resolver.ResolveDrugCode("Amlodipine", "5 mg");

        var description = Catalog.Find("lib_medicine", code)!.Description;
        description.Should().MatchRegex(@"(?<![\d.])5 mg(?![\d.])");
    }

    [Fact]
    public void Bound_official_codes_are_preserved_and_unknown_medicines_are_flagged_by_padding()
    {
        var bound = "ZOLPI0000000069TAB490000000000";
        _resolver.ResolveDrugCode(bound).Should().Be(bound);
        _resolver.ResolveDrugCode(null).Should().Be(PhilHealthCatalogResolver.NoMedicineCode);
        Catalog.Find("lib_medicine", PhilHealthCatalogResolver.NoMedicineCode).Should().NotBeNull();

        var unknown = _resolver.ResolveDrugCode("Unobtainium syrup");
        unknown.Should().HaveLength(30);
        Catalog.Find("lib_medicine", unknown).Should().BeNull("unmapped medicines must be flagged, not given a made-up catalog code");
    }
}
