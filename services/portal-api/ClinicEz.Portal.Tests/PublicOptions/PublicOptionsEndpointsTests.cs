using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Infrastructure.Locations;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Options;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Xunit;

namespace ClinicEz.Portal.Tests.PublicOptions;

public sealed class PublicOptionsEndpointsTests
{
    private readonly IPsgcLocationService _psgcService = new PsgcLocationService();

    [Fact]
    public void GetManifest_WithoutIfNoneMatch_ReturnsOkWithETagAndOptionSets()
    {
        var httpContext = new DefaultHttpContext();

        var result = PublicOptionsEndpoints.GetManifest(httpContext);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<OptionsManifestResponse>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.False(string.IsNullOrWhiteSpace(apiResponse.Data.ManifestVersion));
        Assert.NotEmpty(apiResponse.Data.OptionSets);
        Assert.True(httpContext.Response.Headers.ContainsKey("ETag"));
        Assert.True(httpContext.Response.Headers.ContainsKey("Cache-Control"));
    }

    [Fact]
    public void GetManifest_WithMatchingIfNoneMatch_Returns304NotModified()
    {
        var manifestVersion = EhrStaticOptions.StaticManifestVersion;
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers.IfNoneMatch = EhrOptionVersionHelper.FormatETag(manifestVersion);

        var result = PublicOptionsEndpoints.GetManifest(httpContext);

        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status304NotModified, statusResult.StatusCode);
        Assert.Equal(EhrOptionVersionHelper.FormatETag(manifestVersion), httpContext.Response.Headers.ETag.ToString());
    }

    [Fact]
    public void GetOptionSet_ValidOptionSet_ReturnsOkWithDescriptorsAndETag()
    {
        var httpContext = new DefaultHttpContext();

        var result = PublicOptionsEndpoints.GetOptionSet("sex", httpContext);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<IReadOnlyCollection<EhrOptionDescriptor>>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotEmpty(apiResponse.Data!);
        Assert.True(httpContext.Response.Headers.ContainsKey("ETag"));
    }

    [Fact]
    public void GetOptionSet_WithMatchingIfNoneMatch_Returns304NotModified()
    {
        var setVersion = EhrStaticOptions.GetOptionSetVersion("sex");
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers.IfNoneMatch = EhrOptionVersionHelper.FormatETag(setVersion);

        var result = PublicOptionsEndpoints.GetOptionSet("sex", httpContext);

        var statusResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status304NotModified, statusResult.StatusCode);
    }

    [Fact]
    public void GetOptionSet_UnknownOptionSet_Returns404NotFound()
    {
        var httpContext = new DefaultHttpContext();

        var result = PublicOptionsEndpoints.GetOptionSet("non_existent_set_999", httpContext);

        var notFoundResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFoundResult.StatusCode);
    }

    [Fact]
    public void GetAllOptions_ReturnsAllOptionSets()
    {
        var httpContext = new DefaultHttpContext();

        var result = PublicOptionsEndpoints.GetAllOptions(httpContext);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<IReadOnlyDictionary<string, IReadOnlyList<EhrOptionDescriptor>>>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.NotEmpty(apiResponse.Data);
        Assert.True(apiResponse.Data.ContainsKey("sex"));
    }

    [Fact]
    public async Task GetRegionsAsync_ReturnsAll17PsgcRegionsWith10DigitCodes()
    {
        var result = await PublicOptionsEndpoints.GetRegionsAsync(_psgcService, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<IReadOnlyList<PsgcLocationDto>>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.Equal(17, apiResponse.Data.Count);
        Assert.All(apiResponse.Data, r =>
        {
            Assert.Equal("Region", r.Level);
            Assert.Equal(10, r.PsgcCode.Length);
            Assert.True(r.PsgcCode.All(char.IsDigit));
        });
    }

    [Fact]
    public async Task GetProvincesAsync_WithRegionFilter_ReturnsFilteredProvinces()
    {
        // Region 4A (CALABARZON): 0400000000
        var result = await PublicOptionsEndpoints.GetProvincesAsync("0400000000", _psgcService, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<IReadOnlyList<PsgcLocationDto>>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.NotEmpty(apiResponse.Data);
        Assert.All(apiResponse.Data, p =>
        {
            Assert.Equal("Province", p.Level);
            Assert.Equal("0400000000", p.RegionPsgc);
            Assert.Equal(10, p.PsgcCode.Length);
        });
    }

    [Fact]
    public async Task GetCitiesMunicipalitiesAsync_WithProvinceFilter_ReturnsFilteredCities()
    {
        // Cavite: 0421000000
        var result = await PublicOptionsEndpoints.GetCitiesMunicipalitiesAsync("0421000000", null, _psgcService, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<IReadOnlyList<PsgcLocationDto>>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.NotEmpty(apiResponse.Data);
        Assert.All(apiResponse.Data, c =>
        {
            Assert.Equal("0421000000", c.ProvincePsgc);
            Assert.Equal(10, c.PsgcCode.Length);
        });
    }

    [Fact]
    public async Task GetBarangaysAsync_MissingCity_ReturnsBadRequest()
    {
        var result = await PublicOptionsEndpoints.GetBarangaysAsync("", _psgcService, CancellationToken.None);

        var badRequestResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequestResult.StatusCode);
    }

    [Fact]
    public async Task GetBarangaysAsync_ValidCity_ReturnsBarangays()
    {
        // City of Manila: 1339010000
        var result = await PublicOptionsEndpoints.GetBarangaysAsync("1339010000", _psgcService, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<IReadOnlyList<PsgcLocationDto>>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.NotEmpty(apiResponse.Data);
        Assert.All(apiResponse.Data, b =>
        {
            Assert.Equal("Barangay", b.Level);
            Assert.Equal("1339010000", b.CityMunicipalityPsgc);
            Assert.Equal(10, b.PsgcCode.Length);
        });
    }

    [Fact]
    public async Task SearchLocationsAsync_EmptyQuery_ReturnsEmptyList()
    {
        var result = await PublicOptionsEndpoints.SearchLocationsAsync("", null, _psgcService, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<IReadOnlyList<PsgcLocationDto>>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.Empty(apiResponse.Data);
    }

    [Fact]
    public async Task SearchLocationsAsync_MatchingQuery_ReturnsMatchingResults()
    {
        var result = await PublicOptionsEndpoints.SearchLocationsAsync("Manila", 10, _psgcService, CancellationToken.None);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var apiResponse = Assert.IsAssignableFrom<ApiResponse<IReadOnlyList<PsgcLocationDto>>>(okResult.Value);
        Assert.True(apiResponse.Succeeded);
        Assert.NotNull(apiResponse.Data);
        Assert.NotEmpty(apiResponse.Data);
        Assert.Contains(apiResponse.Data, item => item.Name.Contains("Manila", StringComparison.OrdinalIgnoreCase));
    }
}
