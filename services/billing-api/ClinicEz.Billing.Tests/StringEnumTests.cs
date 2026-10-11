using System.Text.Json;
using ClinicEz.Billing.Api;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Tests.TestSupport;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ClinicEz.Billing.Tests;

/// <summary>Every enum is a string in the database and on the wire; a number is never accepted in its place.</summary>
public class StringEnumTests
{
    private static JsonSerializerOptions ApiJson()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddApiServices();
        using var provider = services.BuildServiceProvider();
        return provider.GetRequiredService<IOptions<JsonOptions>>().Value.JsonSerializerOptions;
    }

    [Fact]
    public async Task Every_enum_property_of_the_model_is_stored_as_a_string()
    {
        using var host = new BillingHost();

        var offenders = await host.Db(db => Task.FromResult(StringEnumModel.FindNonStringEnumProperties(db.Model)));
        var status = await host.Db(db => Task.FromResult(db.Model.FindEntityType(typeof(Invoice))!.FindProperty(nameof(Invoice.Status))!));

        offenders.Should().BeEmpty();
        status.GetProviderClrType().Should().Be(typeof(string));
        status.GetMaxLength().Should().Be(32);
    }

    [Fact]
    public void Dtos_serialise_enums_as_names_and_read_them_back()
    {
        var json = ApiJson();
        var request = new TakePaymentRequest(PaymentMethod.GCash, 100m, "REF", null, InsurerKind.Hmo, Guid.NewGuid(), null);

        var text = JsonSerializer.Serialize(request, json);

        using var doc = JsonDocument.Parse(text);
        doc.RootElement.GetProperty("method").GetString().Should().Be("GCash");
        doc.RootElement.GetProperty("insurerKind").GetString().Should().Be("Hmo");
        JsonSerializer.Deserialize<TakePaymentRequest>(text, json)!.Method.Should().Be(PaymentMethod.GCash);
    }

    [Theory]
    [InlineData("""{"kind":1,"mode":"Percentage"}""")]
    [InlineData("""{"kind":"Senior","mode":0}""")]
    [InlineData("""{"kind":"1","mode":"Percentage"}""")]
    [InlineData("""{"kind":"Nonsense","mode":"Percentage"}""")]
    public void A_number_or_unknown_name_in_place_of_an_enum_is_rejected(string body)
    {
        var act = () => JsonSerializer.Deserialize<ApplyDiscountRequest>(body, ApiJson());

        act.Should().Throw<JsonException>();
    }
}
