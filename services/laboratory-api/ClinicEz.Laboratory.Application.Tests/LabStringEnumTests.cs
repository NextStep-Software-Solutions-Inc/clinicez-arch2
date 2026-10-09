using System.Globalization;
using System.Text.Json;
using ClinicEz.Laboratory.Api.Controllers;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Mvc.ModelBinding.Binders;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using NSubstitute;

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>The platform rule for enums: stored as their C# name, sent and accepted as their name, never as a number.</summary>
public class LabStringEnumTests
{
    private static JsonSerializerOptions MvcJson()
    {
        var provider = new ServiceCollection().AddStrictStringEnums().BuildServiceProvider();
        return new JsonSerializerOptions(provider.GetRequiredService<IOptions<Microsoft.AspNetCore.Mvc.JsonOptions>>().Value.JsonSerializerOptions);
    }

    [Fact]
    public void Every_enum_property_of_the_model_is_stored_as_a_string()
    {
        var (db, _, _) = LabTestDbHelper.CreateTestContext();
        using (db)
        {
            StringEnumModel.FindNonStringEnumProperties(db.Model).Should().BeEmpty();
        }
    }

    [Fact]
    public void An_enum_is_written_as_its_name_and_read_back_from_its_name()
    {
        var options = MvcJson();
        var request = new StoreSpecimenRequest { RackId = "R1", RackPosition = "A1", Temperature = StorageTemperature.Frozen_Minus20C };

        var json = JsonSerializer.Serialize(request, options);
        var roundTripped = JsonSerializer.Deserialize<StoreSpecimenRequest>(json, options)!;

        json.Should().Contain("\"temperature\":\"Frozen_Minus20C\"");
        roundTripped.Temperature.Should().Be(StorageTemperature.Frozen_Minus20C);
    }

    [Theory]
    [InlineData("{\"RackId\":\"R1\",\"RackPosition\":\"A1\",\"Temperature\":1}")]
    [InlineData("{\"RackId\":\"R1\",\"RackPosition\":\"A1\",\"Temperature\":\"1\"}")]
    [InlineData("{\"RackId\":\"R1\",\"RackPosition\":\"A1\",\"Temperature\":\"NotATemperature\"}")]
    public void A_number_or_an_unknown_name_is_rejected_instead_of_silently_mapped(string body)
    {
        var act = () => JsonSerializer.Deserialize<StoreSpecimenRequest>(body, MvcJson());

        act.Should().Throw<JsonException>();
    }

    [Fact]
    public void A_required_enum_in_a_request_must_be_a_valid_name()
    {
        var options = MvcJson();

        JsonSerializer.Deserialize<RejectSpecimenRequest>("{\"ReasonCode\":\"Hemolyzed\"}", options)!
            .ReasonCode.Should().Be(SpecimenRejectionReason.Hemolyzed);
        var numeric = () => JsonSerializer.Deserialize<RejectSpecimenRequest>("{\"ReasonCode\":2}", options);
        numeric.Should().Throw<JsonException>();
    }

    private static async Task<(ModelBindingResult Result, ModelStateDictionary State)> BindQueryAsync<T>(string? value)
    {
        var metadata = new EmptyModelMetadataProvider().GetMetadataForType(typeof(T));
        var providerContext = Substitute.For<ModelBinderProviderContext>();
        providerContext.Metadata.Returns(metadata);
        var binder = new StringEnumModelBinderProvider().GetBinder(providerContext)!;

        var query = new Dictionary<string, StringValues>();
        if (value is not null) query["status"] = value;
        var state = new ModelStateDictionary();
        var context = new DefaultModelBindingContext
        {
            ModelName = "status",
            ModelMetadata = metadata,
            ModelState = state,
            ValueProvider = new QueryStringValueProvider(BindingSource.Query, new QueryCollection(query), CultureInfo.InvariantCulture)
        };

        await binder.BindModelAsync(context);
        return (context.Result, state);
    }

    [Theory]
    [InlineData("Verified", RequisitionStatus.Verified)]
    [InlineData("verified", RequisitionStatus.Verified)]
    public async Task A_query_enum_binds_by_name(string value, RequisitionStatus expected)
    {
        var (result, _) = await BindQueryAsync<RequisitionStatus?>(value);

        result.IsModelSet.Should().BeTrue();
        result.Model.Should().Be(expected);
    }

    [Theory]
    [InlineData("1")]
    [InlineData("99")]
    [InlineData("Nonsense")]
    public async Task A_query_enum_given_a_number_or_unknown_name_is_a_validation_error(string value)
    {
        var (result, state) = await BindQueryAsync<RequisitionStatus?>(value);

        result.IsModelSet.Should().BeFalse();
        state.ErrorCount.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task An_absent_or_empty_nullable_query_enum_means_no_filter()
    {
        var (absent, _) = await BindQueryAsync<RequisitionStatus?>(null);
        var (empty, state) = await BindQueryAsync<RequisitionStatus?>(string.Empty);

        absent.IsModelSet.Should().BeFalse();
        empty.IsModelSet.Should().BeTrue();
        empty.Model.Should().BeNull();
        state.ErrorCount.Should().Be(0);
    }
}
