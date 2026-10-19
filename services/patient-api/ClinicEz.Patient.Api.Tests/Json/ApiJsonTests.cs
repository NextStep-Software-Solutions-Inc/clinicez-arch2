using System.Text.Json;
using ClinicEz.Patient.Api.Infrastructure;
using ClinicEz.Patient.Application.Features.Documents;
using FluentAssertions;

namespace ClinicEz.Patient.Api.Tests.Json;

/// <summary>The API speaks enums as C# member names only: written as PascalCase strings, never accepted as numbers.</summary>
public sealed class ApiJsonTests
{
    private sealed record Sample(LabPaymentStatus Payment, DayOfWeek Day, LabPaymentStatus? Optional);

    private static readonly JsonSerializerOptions Options = ApiJson.Configure(new JsonSerializerOptions());

    [Fact]
    public void Enums_are_written_as_pascal_case_member_names_under_camel_case_properties()
    {
        var json = JsonSerializer.Serialize(new Sample(LabPaymentStatus.Paid, DayOfWeek.Monday, null), Options);

        json.Should().Be("""{"payment":"Paid","day":"Monday"}""");
    }

    [Fact]
    public void Enums_round_trip_by_name()
    {
        var back = JsonSerializer.Deserialize<Sample>(
            JsonSerializer.Serialize(new Sample(LabPaymentStatus.Pending, DayOfWeek.Sunday, LabPaymentStatus.None), Options), Options);

        back.Should().Be(new Sample(LabPaymentStatus.Pending, DayOfWeek.Sunday, LabPaymentStatus.None));
    }

    [Theory]
    [InlineData("""{"payment":1,"day":"Monday"}""")]
    [InlineData("""{"payment":"Paid","day":1}""")]
    [InlineData("""{"payment":"1","day":"Monday"}""")]
    [InlineData("""{"payment":"Paid","day":"Monday","optional":2}""")]
    public void A_numeric_enum_value_is_rejected(string json)
    {
        var act = () => JsonSerializer.Deserialize<Sample>(json, Options);

        act.Should().Throw<JsonException>();
    }

    [Fact]
    public void An_unknown_enum_name_is_rejected()
    {
        var act = () => JsonSerializer.Deserialize<Sample>("""{"payment":"Refunded","day":"Monday"}""", Options);

        act.Should().Throw<JsonException>();
    }
}
