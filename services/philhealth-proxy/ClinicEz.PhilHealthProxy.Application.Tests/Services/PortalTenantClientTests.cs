using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Services;

public sealed class PortalTenantClientTests
{
    private sealed class MockHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handlerFunc)
        : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            return Task.FromResult(handlerFunc(request));
        }
    }

    private static IDataProtectionProvider CreateDataProtectionProvider()
    {
        return new EphemeralDataProtectionProvider();
    }

    [Fact]
    public async Task GetByTenantIdAsync_CacheMiss_FetchesFromPortal_AndCachesForSubsequentCalls()
    {
        // Arrange
        var tenantId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        int httpCallCount = 0;

        var portalResponseJson = JsonSerializer.Serialize(new
        {
            tenantId = tenantId,
            branchId = branchId,
            facilityName = "Downtown Medical",
            accreditationNumber = "H91001234",
            pmccNumber = "Z15445",
            softwareCertificateId = "KON-DUMMYCERTS-Z15445",
            secretKey = "portal_secret_key",
            cipherKey = "CLINICEZ-YAKAP-KEY-32BYTES-LONG!",
            baseUrl = "https://staging.philhealth.gov.ph",
            isActive = true
        });

        var handler = new MockHttpMessageHandler(req =>
        {
            httpCallCount++;
            req.RequestUri!.ToString().Should().Contain($"/api/v1/internal/tenants/{tenantId}/philhealth-config");
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(portalResponseJson, System.Text.Encoding.UTF8, "application/json")
            };
        });

        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:5000") };
        var cache = new MemoryCache(new MemoryCacheOptions());
        var dataProtection = CreateDataProtectionProvider();
        var client = new PortalTenantClient(httpClient, cache, dataProtection, NullLogger<PortalTenantClient>.Instance);

        // Act 1: Initial call (cache miss)
        var result1 = await client.GetByTenantIdAsync(tenantId);

        // Assert 1
        result1.Should().NotBeNull();
        result1!.TenantId.Should().Be(tenantId);
        result1.PmccNumber.Should().Be("Z15445");
        result1.AccreditationNumber.Should().Be("H91001234");
        result1.BaseUrl.Should().Be("https://staging.philhealth.gov.ph");
        result1.IsActive.Should().BeTrue();
        httpCallCount.Should().Be(1);

        // Verify credentials were encrypted via DataProtection
        var protector = dataProtection.CreateProtector("ClinicEz.PhilHealthProxy.TenantCredentials");
        protector.Unprotect(result1.EncryptedSecretKey).Should().Be("portal_secret_key");
        protector.Unprotect(result1.EncryptedCipherKey).Should().Be("CLINICEZ-YAKAP-KEY-32BYTES-LONG!");

        // Act 2: Second call within 1 hour (cache hit)
        var result2 = await client.GetByTenantIdAsync(tenantId);

        // Assert 2: Cached result returned without another HTTP roundtrip
        result2.Should().NotBeNull();
        result2!.PmccNumber.Should().Be("Z15445");
        httpCallCount.Should().Be(1);
    }

    [Fact]
    public async Task GetByBranchIdAsync_CacheMiss_FetchesFromPortal_AndCachesUnderBranchKey_WithoutClobberingTenant()
    {
        // Arrange
        var tenantId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        int httpCallCount = 0;

        var portalResponseJson = JsonSerializer.Serialize(new
        {
            tenantId = tenantId,
            branchId = branchId,
            facilityName = "Uptown Health Hub",
            accreditationNumber = "H92005678",
            pmccNumber = "Z1002",
            softwareCertificateId = "KON-UPTOWN-Z1002",
            secretKey = "uptown_secret",
            cipherKey = "UPTOWN-CIPHER-KEY-32BYTES-LONG!",
            baseUrl = "https://staging.philhealth.gov.ph",
            isActive = true
        });

        var handler = new MockHttpMessageHandler(req =>
        {
            httpCallCount++;
            req.RequestUri!.ToString().Should().Contain($"/api/v1/internal/branches/{branchId}/philhealth-config");
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(portalResponseJson, System.Text.Encoding.UTF8, "application/json")
            };
        });

        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:5000") };
        var cache = new MemoryCache(new MemoryCacheOptions());
        var dataProtection = CreateDataProtectionProvider();
        var client = new PortalTenantClient(httpClient, cache, dataProtection, NullLogger<PortalTenantClient>.Instance);

        // Act 1: Fetch by BranchId
        var branchResult = await client.GetByBranchIdAsync(branchId);

        // Assert
        branchResult.Should().NotBeNull();
        branchResult!.PmccNumber.Should().Be("Z1002");
        httpCallCount.Should().Be(1);

        // Act 2: Second call by BranchId hits cache
        var branchResult2 = await client.GetByBranchIdAsync(branchId);
        branchResult2.Should().NotBeNull();
        branchResult2!.PmccNumber.Should().Be("Z1002");
        httpCallCount.Should().Be(1); // No second HTTP call!

        // Act 3: Invalidate cache and call again (cache miss)
        client.InvalidateCache(tenantId, branchId);
        var branchResult3 = await client.GetByBranchIdAsync(branchId);
        branchResult3.Should().NotBeNull();
        httpCallCount.Should().Be(2); // New HTTP call after invalidation!
    }

    [Fact]
    public async Task GetByTenantIdAsync_WhenPortalReturns404_ReturnsNull()
    {
        // Arrange
        var tenantId = Guid.NewGuid();
        var handler = new MockHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:5000") };
        var cache = new MemoryCache(new MemoryCacheOptions());
        var dataProtection = CreateDataProtectionProvider();
        var client = new PortalTenantClient(httpClient, cache, dataProtection, NullLogger<PortalTenantClient>.Instance);

        // Act
        var result = await client.GetByTenantIdAsync(tenantId);

        // Assert
        result.Should().BeNull();
    }
}
