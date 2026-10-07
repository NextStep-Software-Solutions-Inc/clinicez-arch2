using System.Net;
using System.Net.Http.Json;
using ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;
using FluentAssertions;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Endpoints;

public sealed class YakapEndpointTests(KonsultaWebApplicationFactory factory)
    : IClassFixture<KonsultaWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task ValidatePin_ReturnsTrue_ForValidPhilHealthPin()
    {
        var response = await _client.GetAsync("/api/yakap/pin/030263078507/validate");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResult<bool>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().BeTrue();
    }

    [Fact]
    public async Task ValidatePin_ReturnsFalse_ForInvalidPhilHealthPin()
    {
        var response = await _client.GetAsync("/api/yakap/pin/111111111111/validate");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResult<bool>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().BeFalse();
    }
}
