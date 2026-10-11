using System.Text.Json;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Tests.Persistence;

/// <summary>Guards the platform rule that every enum is stored as a string and travels as a string.</summary>
public class StringEnumTests
{
    private sealed record SubscriptionDto(SubscriptionStatus Status, FacilityVisibility? Visibility = null);

    [Fact]
    public void Every_enum_property_of_the_model_is_stored_as_a_string()
    {
        using var context = TestSupport.NewContext();

        Assert.Empty(StringEnumModel.FindNonStringEnumProperties(context.Model));
    }

    [Fact]
    public void Http_pipeline_writes_enums_as_names_and_rejects_numbers()
    {
        var provider = new ServiceCollection().AddStrictStringEnums().BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<JsonOptions>>().Value.SerializerOptions;

        Assert.Equal("{\"status\":\"PastDue\",\"visibility\":\"Public\"}", JsonSerializer.Serialize(new SubscriptionDto(SubscriptionStatus.PastDue, FacilityVisibility.Public), options));
        Assert.Equal(SubscriptionStatus.Active, JsonSerializer.Deserialize<SubscriptionDto>("{\"status\":\"Active\"}", options)!.Status);
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<SubscriptionDto>("{\"status\":1}", options));
    }

    [Fact]
    public void Facility_deployment_round_trips_by_name_and_rejects_numbers()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var dto = new FacilityDeploymentDto(Guid.NewGuid(), FacilityDeploymentMode.OnPremise, null);

        var json = JsonSerializer.Serialize(dto, options);

        Assert.Contains("\"deploymentMode\":\"OnPremise\"", json);
        Assert.Equal(FacilityDeploymentMode.OnPremise, JsonSerializer.Deserialize<FacilityDeploymentDto>(json, options)!.DeploymentMode);
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<FacilityDeploymentDto>(json.Replace("\"OnPremise\"", "1"), options));
    }
}
