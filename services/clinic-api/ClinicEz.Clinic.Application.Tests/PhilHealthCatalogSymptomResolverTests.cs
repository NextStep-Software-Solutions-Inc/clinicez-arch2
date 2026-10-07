using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using FluentAssertions;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>Signs/symptoms, management and immunization defaults are coded from the PhilHealth Catalog.</summary>
public class PhilHealthCatalogSymptomResolverTests
{
    private static readonly PhilHealthCatalogLookup Catalog = PhilHealthCatalogLookup.FromBundledSeed();
    private readonly PhilHealthCatalogResolver _resolver = new(Catalog);

    [Theory]
    [InlineData("Cough for 3 days", "09")]
    [InlineData("high grade FEVER since yesterday", "37")]
    [InlineData("persistent headache", "18")]
    [InlineData("chest pain on exertion", "08")]
    [InlineData("vomiting x2", "35")]
    [InlineData("nausea", "35")]
    public void Complaint_text_resolves_to_the_official_sign_symptom_code(string text, string expected)
    {
        var code = _resolver.ResolveSignsSymptomsCode(text);

        code.Should().Be(expected);
        Catalog.Find("lib_signs_symptoms", code).Should().NotBeNull();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("feeling unwell")]
    public void Unrecognised_complaints_map_to_the_catalog_others_entry(string? text)
    {
        _resolver.ResolveSignsSymptomsCode(text).Should().Be("X");
        Catalog.Find("lib_signs_symptoms", "X")!.Description.Should().Be("OTHERS");
    }

    [Fact]
    public void Management_is_not_applicable_without_advice_and_others_with_it()
    {
        var none = _resolver.ResolveManagementCode(hasAdvice: false);
        var others = _resolver.ResolveManagementCode(hasAdvice: true);

        Catalog.Find("lib_management", none)!.Description.Should().Be("Not applicable");
        Catalog.Find("lib_management", others)!.Description.Should().Be("Others");
    }

    [Fact]
    public void No_immunization_code_comes_from_the_catalog()
    {
        var code = _resolver.NoImmunizationCode();

        code.Should().NotBeEmpty();
        Catalog.Find("lib_immchild", code)!.Description.Should().Be("None");
    }

    [Fact]
    public void Exam_defaults_are_each_librarys_own_active_essentially_normal_entry()
    {
        var exam = _resolver.EssentiallyNormalExam();

        var expected = new (string? Code, string Library)[]
        {
            (exam.SkinId, "lib_skin_extremities"),
            (exam.HeentId, "lib_heent"),
            (exam.ChestId, "lib_chest"),
            (exam.HeartId, "lib_heart"),
            (exam.AbdomenId, "lib_abdomen"),
            (exam.NeuroId, "lib_neuro"),
            (exam.RectalId, "lib_digital_rectal"),
            (exam.GuId, "lib_genitourinary"),
        };

        foreach (var (code, library) in expected)
        {
            var entry = Catalog.Find(library, code ?? string.Empty);
            entry.Should().NotBeNull($"{library} must resolve '{code}'");
            entry!.IsActive.Should().BeTrue();
            entry.Description.ToLowerInvariant().Should().StartWith("essentially normal", library);
        }

        // The old literal "1" would have meant "Adynamic precordium" (an inactive finding) for the heart.
        exam.HeartId.Should().Be("5");
    }

    [Fact]
    public void Every_resolved_code_exists_in_its_library()
    {
        foreach (var text in new[] { "cough", "fever", "diarrhea", "rash", "abdominal pain", "shortness of breath" })
        {
            var code = _resolver.ResolveSignsSymptomsCode(text);
            Catalog.Find("lib_signs_symptoms", code).Should().NotBeNull($"'{text}' resolved to '{code}'");
        }
    }
}
