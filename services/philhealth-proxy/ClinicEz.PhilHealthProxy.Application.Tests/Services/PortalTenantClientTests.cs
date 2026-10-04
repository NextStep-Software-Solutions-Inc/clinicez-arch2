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
            username = "portal_user",
            password = "portal_password",
            cipherKey = "CLINICEZ-YAKAP-KEY-32BYTES-LONG!",
            konsultaEndpoint = "https://staging.philhealth.gov.ph/KONSULTA/SOAP",
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
        result1.IsActive.Should().BeTrue();
        httpCallCount.Should().Be(1);

        // Verify credentials were encrypted via DataProtection
        var protector = dataProtection.CreateProtector("ClinicEz.PhilHealthProxy.TenantCredentials");
        protector.Unprotect(result1.EncryptedUsername).Should().Be("portal_user");
        protector.Unprotect(result1.EncryptedPassword).Should().Be("portal_password");
        protector.Unprotect(result1.EncryptedCipherKey).Should().Be("CLINICEZ-YAKAP-KEY-32BYTES-LONG!");

        // Act 2: Second call within 1 hour (cache hit)
        var result2 = await client.GetByTenantIdAsync(tenantId);

        // Assert 2: Cached result returned without another HTTP roundtrip
        result2.Should().NotBeNull();
        result2!.PmccNumber.Should().Be("Z15445");
        httpCallCount.Should().Be(1);
    }

    [Fact]
    public async Task GetByBranchIdAsync_CacheMiss_FetchesFromPortal_AndCachesUnderBothBranchAndTenant()
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
            username = "uptown_user",
            password = "uptown_password",
            cipherKey = "UPTOWN-CIPHER-KEY-32BYTES-LONG!",
            konsultaEndpoint = "https://staging.philhealth.gov.ph/KONSULTA/SOAP",
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

        // Act 2: Fetch by TenantId (should hit the cache populated during branch resolution!)
        var tenantResult = await client.GetByTenantIdAsync(tenantId);
        tenantResult.Should().NotBeNull();
        tenantResult!.PmccNumber.Should().Be("Z1002");
        httpCallCount.Should().Be(1); // No second HTTP call!
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
