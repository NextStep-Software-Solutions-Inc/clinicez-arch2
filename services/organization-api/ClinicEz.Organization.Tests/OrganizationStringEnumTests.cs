using System.Text.Json;
using ClinicEz.Organization.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ClinicEz.Organization.Tests;

/// <summary>The platform rule for enums: stored as their C# name, sent and accepted as their name, never as a number.</summary>
public class OrganizationStringEnumTests
{
    private enum Tier { Basic, Standard }

    private sealed record Sample(Tier Tier, Tier? Optional = null);

    private static JsonSerializerOptions MvcJson()
    {
        var provider = new ServiceCollection().AddStrictStringEnums().BuildServiceProvider();
        return new JsonSerializerOptions(provider.GetRequiredService<IOptions<Microsoft.AspNetCore.Mvc.JsonOptions>>().Value.JsonSerializerOptions);
    }

    [Fact]
    public void Every_enum_property_of_the_model_is_stored_as_a_string()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["DbSchema"] = "organization_dashboard" })
            .Build();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Organization_StringEnums_{Guid.NewGuid()}")
            .Options;

        using var db = new ApplicationDbContext(options, config);

        StringEnumModel.FindNonStringEnumProperties(db.Model).Should().BeEmpty();
    }

    [Fact]
    public void An_enum_is_written_as_its_name_and_read_back_from_its_name()
    {
        var options = MvcJson();

        var json = JsonSerializer.Serialize(new Sample(Tier.Standard, Tier.Basic), options);
        var roundTripped = JsonSerializer.Deserialize<Sample>(json, options)!;

        json.Should().Contain("\"tier\":\"Standard\"").And.Contain("\"optional\":\"Basic\"");
        roundTripped.Should().Be(new Sample(Tier.Standard, Tier.Basic));
    }

    [Theory]
    [InlineData("{\"Tier\":1}")]
    [InlineData("{\"Tier\":\"1\"}")]
    [InlineData("{\"Tier\":\"Platinum\"}")]
    [InlineData("{\"Tier\":\"Basic\",\"Optional\":0}")]
    public void A_number_or_an_unknown_name_is_rejected_instead_of_silently_mapped(string body)
    {
        var act = () => JsonSerializer.Deserialize<Sample>(body, MvcJson());

        act.Should().Throw<JsonException>();
    }
}
