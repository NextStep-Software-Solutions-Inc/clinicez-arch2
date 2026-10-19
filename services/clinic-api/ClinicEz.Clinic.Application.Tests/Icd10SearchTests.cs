using ClinicEz.Clinic.Application.Features.Icd10;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class Icd10SearchTests
{
    private static SearchIcd10CodesQueryHandler Handler() => new(PhilHealthCatalogLookup.FromBundledSeed());

    private static Task<IReadOnlyList<Icd10ItemDto>> Search(string? q) =>
        Handler().Handle(new SearchIcd10CodesQuery(q), CancellationToken.None);

    [Fact]
    public async Task EmptyQuery_ReturnsNothing_NoBuiltInList()
    {
        (await Search(null)).Should().BeEmpty();
        (await Search("   ")).Should().BeEmpty();
    }

    [Fact]
    public async Task CodePrefix_ReturnsCodeMatchesFirst()
    {
        var results = await Search("I10");

        results.Should().NotBeEmpty();
        results[0].Code.Should().StartWith("I10");
    }

    [Fact]
    public async Task DescriptionWords_MatchOfficialPhilHealthIcdTerms()
    {
        var results = await Search("hypertension");

        results.Should().NotBeEmpty();
        results.Should().OnlyContain(r => r.Description.Contains("hypertension", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Results_AreUniquePerCode_AndCapped()
    {
        var results = await Search("a");

        results.Count.Should().BeLessThanOrEqualTo(SearchIcd10CodesQueryHandler.MaxResults);
        results.Select(r => r.Code).Should().OnlyHaveUniqueItems();
    }
}
