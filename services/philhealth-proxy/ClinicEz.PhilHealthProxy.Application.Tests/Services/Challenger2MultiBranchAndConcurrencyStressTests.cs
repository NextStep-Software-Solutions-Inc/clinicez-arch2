using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Services;

public sealed class Challenger2MultiBranchAndConcurrencyStressTests
{
    private sealed class DynamicHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            return Task.FromResult(handler(request));
        }
    }

    private static IDataProtectionProvider CreateDataProtection() => new EphemeralDataProtectionProvider();

    #region 1. Multi-Branch Isolation Stress Tests

    [Fact]
    public async Task MultiBranchIsolation_QueryBranchB_ThenTenantDefault_ThenBranchA_AssertNoCacheCollision()
    {
        // Arrange: Tenant T with Branch A (H10000001), Branch B (H10000002), and Tenant default (H10000000)
        var tenantId = Guid.NewGuid();
        var branchAId = Guid.NewGuid();
        var branchBId = Guid.NewGuid();

        var callCounts = new ConcurrentDictionary<string, int>();

        var handler = new DynamicHttpMessageHandler(req =>
        {
            var url = req.RequestUri!.ToString();

            if (url.Contains($"/api/v1/internal/branches/{branchBId}/philhealth-config"))
            {
                callCounts.AddOrUpdate("branchB", 1, (_, c) => c + 1);
                var json = JsonSerializer.Serialize(new
                {
                    tenantId,
                    branchId = branchBId,
                    facilityName = "Clinic Branch B",
                    accreditationNumber = "H10000002",
                    pmccNumber = "Z20002",
                    softwareCertificateId = "CERT-BRANCH-B",
                    secretKey = "secret-b-key",
                    cipherKey = "KEY-32-BYTES-BRANCH-B-1234567890",
                    baseUrl = "https://pcapi.philhealth.gov.ph",
                    isActive = true
                });
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
                };
            }

            if (url.Contains($"/api/v1/internal/branches/{branchAId}/philhealth-config"))
            {
                callCounts.AddOrUpdate("branchA", 1, (_, c) => c + 1);
                var json = JsonSerializer.Serialize(new
                {
                    tenantId,
                    branchId = branchAId,
                    facilityName = "Clinic Branch A",
                    accreditationNumber = "H10000001",
                    pmccNumber = "Z20001",
                    softwareCertificateId = "CERT-BRANCH-A",
                    secretKey = "secret-a-key",
                    cipherKey = "KEY-32-BYTES-BRANCH-A-1234567890",
                    baseUrl = "https://pcapi.philhealth.gov.ph",
                    isActive = true
                });
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
                };
            }

            if (url.Contains($"/api/v1/internal/tenants/{tenantId}/philhealth-config"))
            {
                callCounts.AddOrUpdate("tenantDefault", 1, (_, c) => c + 1);
                var json = JsonSerializer.Serialize(new
                {
                    tenantId,
                    branchId = (Guid?)null,
                    facilityName = "Clinic HQ Default",
                    accreditationNumber = "H10000000",
                    pmccNumber = "Z20000",
                    softwareCertificateId = "CERT-TENANT-DEFAULT",
                    secretKey = "secret-default-key",
                    cipherKey = "KEY-32-BYTES-DEFAULT-T-1234567890",
                    baseUrl = "https://pcapi.philhealth.gov.ph",
                    isActive = true
                });
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
                };
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:5000") };
        var cache = new MemoryCache(new MemoryCacheOptions());
        var dataProtection = CreateDataProtection();
        var client = new PortalTenantClient(httpClient, cache, dataProtection, NullLogger<PortalTenantClient>.Instance);

        // Act 1: Query Branch B credentials first
        var branchB = await client.GetByBranchIdAsync(branchBId);
        branchB.Should().NotBeNull();
        branchB!.AccreditationNumber.Should().Be("H10000002");
        branchB.BranchId.Should().Be(branchBId);
        callCounts["branchB"].Should().Be(1);

        // Act 2: Query Tenant T default
        var tenantDefault = await client.GetByTenantIdAsync(tenantId);
        tenantDefault.Should().NotBeNull();
        // Critical Assert: Branch B did NOT overwrite Tenant T in cache!
        tenantDefault!.AccreditationNumber.Should().Be("H10000000");
        tenantDefault.BranchId.Should().BeNull();
        callCounts["tenantDefault"].Should().Be(1);

        // Act 3: Query Branch A
        var branchA = await client.GetByBranchIdAsync(branchAId);
        branchA.Should().NotBeNull();
        // Critical Assert: Branch A returns its own accreditation!
        branchA!.AccreditationNumber.Should().Be("H10000001");
        branchA.BranchId.Should().Be(branchAId);
        callCounts["branchA"].Should().Be(1);

        // Act 4: Re-query all three in reverse order to verify independent memory cache isolation
        var branchA_Cached = await client.GetByBranchIdAsync(branchAId);
        var tenantDefault_Cached = await client.GetByTenantIdAsync(tenantId);
        var branchB_Cached = await client.GetByBranchIdAsync(branchBId);

        branchA_Cached!.AccreditationNumber.Should().Be("H10000001");
        tenantDefault_Cached!.AccreditationNumber.Should().Be("H10000000");
        branchB_Cached!.AccreditationNumber.Should().Be("H10000002");

        // Verify no additional HTTP calls were made for any of the 3 entities
        callCounts["branchB"].Should().Be(1);
        callCounts["tenantDefault"].Should().Be(1);
        callCounts["branchA"].Should().Be(1);

        // Act 5: Surgical invalidation of Branch A and Tenant T only
        client.InvalidateCache(tenantId, branchAId);

        // Branch B should STILL be cached and not perform an HTTP request
        var branchB_StillCached = await client.GetByBranchIdAsync(branchBId);
        branchB_StillCached!.AccreditationNumber.Should().Be("H10000002");
        callCounts["branchB"].Should().Be(1);

        // Branch A should perform an HTTP request after invalidation
        var branchA_Reloaded = await client.GetByBranchIdAsync(branchAId);
        branchA_Reloaded!.AccreditationNumber.Should().Be("H10000001");
        callCounts["branchA"].Should().Be(2);

        // Tenant T default should perform an HTTP request after invalidation
        var tenantDefault_Reloaded = await client.GetByTenantIdAsync(tenantId);
        tenantDefault_Reloaded!.AccreditationNumber.Should().Be("H10000000");
        callCounts["tenantDefault"].Should().Be(2);
    }

    #endregion

    #region 2. Token Cache Concurrency & Single Flight Tests

    [Fact]
    public async Task TokenCache_20ConcurrentTasks_AssertOnlySingleUpstreamFetchExecuted()
    {
        // Arrange
        var cache = new PhilHealthTokenCache(NullLogger<PhilHealthTokenCache>.Instance);
        var tenantId = Guid.NewGuid();
        var accreNo = "H10000001";
        int upstreamFetchCount = 0;

        async Task<(string Token, TimeSpan ExpiresIn)> SlowTokenFactory(CancellationToken ct)
        {
            Interlocked.Increment(ref upstreamFetchCount);
            // Simulate 50ms network round-trip to upstream PCAPI OAuth server
            await Task.Delay(50, ct);
            return ("single-flight-verified-token-jwt", TimeSpan.FromMinutes(50));
        }

        // Act: Launch 20 concurrent tasks requesting token for the identical (tenantId, accreNo)
        var concurrentTasks = Enumerable.Range(0, 20)
            .Select(_ => cache.GetOrFetchTokenAsync(tenantId, accreNo, SlowTokenFactory))
            .ToList();

        var tokens = await Task.WhenAll(concurrentTasks);

        // Assert: Exactly 1 upstream fetch must be executed despite 20 concurrent incoming requests
        upstreamFetchCount.Should().Be(1, "Single-flight gate must collapse concurrent requests into one upstream fetch");
        tokens.Should().HaveCount(20);
        tokens.Should().AllSatisfy(t => t.Should().Be("single-flight-verified-token-jwt"));

        // Subsequent call within TTL ceiling hits cache directly
        var immediateToken = await cache.GetOrFetchTokenAsync(tenantId, accreNo, SlowTokenFactory);
        immediateToken.Should().Be("single-flight-verified-token-jwt");
        upstreamFetchCount.Should().Be(1);
    }

    [Fact]
    public async Task TokenCache_CrossPartition_ConcurrentSingleFlights_RunInParallelPerAccreNo()
    {
        // Arrange: Verify that different accreditation numbers have independent single-flight gates
        var cache = new PhilHealthTokenCache(NullLogger<PhilHealthTokenCache>.Instance);
        var tenantId = Guid.NewGuid();
        var accreA = "H10000001";
        var accreB = "H10000002";
        int fetchCountA = 0;
        int fetchCountB = 0;

        var tasksA = Enumerable.Range(0, 10).Select(_ => cache.GetOrFetchTokenAsync(
            tenantId,
            accreA,
            async ct =>
            {
                Interlocked.Increment(ref fetchCountA);
                await Task.Delay(40, ct);
                return ("token-for-accre-a", TimeSpan.FromMinutes(50));
            }));

        var tasksB = Enumerable.Range(0, 10).Select(_ => cache.GetOrFetchTokenAsync(
            tenantId,
            accreB,
            async ct =>
            {
                Interlocked.Increment(ref fetchCountB);
                await Task.Delay(40, ct);
                return ("token-for-accre-b", TimeSpan.FromMinutes(50));
            }));

        // Act
        var allTokens = await Task.WhenAll(tasksA.Concat(tasksB));

        // Assert: Exactly 1 fetch per partition, 2 total
        fetchCountA.Should().Be(1);
        fetchCountB.Should().Be(1);
        allTokens.Where(t => t == "token-for-accre-a").Should().HaveCount(10);
        allTokens.Where(t => t == "token-for-accre-b").Should().HaveCount(10);
    }

    [Fact]
    public async Task TokenCache_401Invalidation_EvictsTokenAndRetriesWithFreshFetch()
    {
        // Arrange
        var cache = new PhilHealthTokenCache(NullLogger<PhilHealthTokenCache>.Instance);
        var tenantId = Guid.NewGuid();
        var accreNo = "H10000001";
        int fetchCount = 0;

        Task<(string Token, TimeSpan ExpiresIn)> Factory(CancellationToken ct)
        {
            var count = Interlocked.Increment(ref fetchCount);
            return Task.FromResult(($"token-v{count}", TimeSpan.FromMinutes(50)));
        }

        // Act 1: Initial fetch
        var initialToken = await cache.GetOrFetchTokenAsync(tenantId, accreNo, Factory);
        initialToken.Should().Be("token-v1");
        fetchCount.Should().Be(1);

        // Act 2: Simulate 401 Unauthorized token eviction
        cache.Invalidate(tenantId, accreNo);

        // Assert 2: Cache is empty for this key
        cache.Get(tenantId, accreNo).Should().BeNull();

        // Act 3: Next request fetches a fresh token
        var refreshedToken = await cache.GetOrFetchTokenAsync(tenantId, accreNo, Factory);
        refreshedToken.Should().Be("token-v2");
        fetchCount.Should().Be(2);
    }

    [Fact]
    public async Task PcapiClient_On401Unauthorized_EvictsTokenAndRetriesSuccessfully()
    {
        // Arrange: Test full end-to-end 401 retry behavior in PhilHealthPcapiClient
        var tokenCache = new PhilHealthTokenCache(NullLogger<PhilHealthTokenCache>.Instance);
        var rateLimiter = new PhilHealthRateLimiter(NullLogger<PhilHealthRateLimiter>.Instance);
        var sandbox = Substitute.For<IPcapiSandboxService>();
        var dataProtection = CreateDataProtection();

        var tenant = new PhilHealthTenant
        {
            TenantId = Guid.NewGuid(),
            AccreditationNumber = "H10000001",
            FacilityName = "Retry Test Clinic",
            SoftwareCertificateId = "CERT-RETRY",
            EncryptedSecretKey = "dummy-secret",
            BaseUrl = "https://pcapi.philhealth.gov.ph"
        };

        int tokenEndpointCalls = 0;
        int pcuStartCalls = 0;

        var handler = new DynamicHttpMessageHandler(req =>
        {
            var path = req.RequestUri!.AbsolutePath;

            // PCAPI OAuth Token Endpoint
            if (path.EndsWith("/api/v1/auth/token"))
            {
                var num = Interlocked.Increment(ref tokenEndpointCalls);
                var tokenJson = JsonSerializer.Serialize(new
                {
                    status = "SUCCESS",
                    code = 200,
                    message = "OK",
                    data = new
                    {
                        access_token = $"bearer-token-generation-{num}",
                        token_type = "Bearer",
                        expires_in = 3600
                    }
                });
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(tokenJson, System.Text.Encoding.UTF8, "application/json")
                };
            }

            // PCAPI PCU Start Endpoint
            if (path.EndsWith("/api/v1/pcu/start"))
            {
                var attempt = Interlocked.Increment(ref pcuStartCalls);
                if (attempt == 1)
                {
                    // First attempt returns 401 Unauthorized (expired token)
                    return new HttpResponseMessage(HttpStatusCode.Unauthorized)
                    {
                        Content = new StringContent("{\"error\":\"401 AUTH_TOKEN_EXPIRED\"}", System.Text.Encoding.UTF8, "application/json")
                    };
                }

                // Retry attempt returns 200 OK
                var pcuJson = JsonSerializer.Serialize(new
                {
                    sdk_url = "https://pcu.philhealth.gov.ph/sdk",
                    liveness_authorization_id = "AUTH-RETRY-SUCCESS-123",
                    status = "PENDING",
                    expires_in = 900
                });
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(pcuJson, System.Text.Encoding.UTF8, "application/json")
                };
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var httpClient = new HttpClient(handler);
        var pcapiClient = new PhilHealthPcapiClient(
            httpClient,
            tokenCache,
            rateLimiter,
            sandbox,
            dataProtection,
            NullLogger<PhilHealthPcapiClient>.Instance);

        // Pre-populate tokenCache with token-generation-1
        tokenCache.Set(tenant.TenantId, tenant.AccreditationNumber, "bearer-token-generation-1", TimeSpan.FromMinutes(50));

        // Act: Invoke StartPcuAsync
        var pcuRequest = new PcuStartRequest(
            Pin: "123456789012",
            FirstName: "Juan",
            MiddleName: "Santos",
            LastName: "Dela Cruz",
            Suffix: null,
            BirthDate: "01/15/1990");

        var response = await pcapiClient.StartPcuAsync(pcuRequest, tenant);

        // Assert:
        // 1. Initial 401 triggered eviction
        // 2. Client called /api/v1/auth/token for a fresh token
        // 3. Client retried /api/v1/pcu/start and succeeded
        response.Should().NotBeNull();
        response.LivenessAuthorizationId.Should().Be("AUTH-RETRY-SUCCESS-123");
        response.SdkUrl.Should().Be("https://pcu.philhealth.gov.ph/sdk");
        pcuStartCalls.Should().Be(2, "Must retry exactly once after receiving 401");
        tokenEndpointCalls.Should().Be(1, "Must fetch fresh token upon eviction");

        // The cache should now store the fresh token
        tokenCache.Get(tenant.TenantId, tenant.AccreditationNumber).Should().Be("bearer-token-generation-1");
    }

    #endregion

    #region 3. Rate Limiter Stress Tests

    [Fact]
    public async Task RateLimiter_ExceedAllowedQuotaInBurst_RejectsSubsequentRequestsWithFalseLease()
    {
        // Arrange: TokenBucket with TokenLimit = 20, QueueLimit = 100 => Total capacity = 120 permits
        await using var rateLimiter = new PhilHealthRateLimiter(NullLogger<PhilHealthRateLimiter>.Instance);
        var tenantId = Guid.NewGuid();
        var accreNo = "H99990001";

        // Act: Dispatch 140 simultaneous lease acquisition requests in a tight burst
        var burstCount = 140;
        var acquisitionTasks = Enumerable.Range(0, burstCount)
            .Select(async i =>
            {
                var lease = await rateLimiter.AcquireAsync(tenantId, accreNo);
                return (Index: i, Acquired: lease.IsAcquired, Lease: lease);
            })
            .ToList();

        var results = await Task.WhenAll(acquisitionTasks);

        // Assert:
        // TokenLimit (20) + QueueLimit (100) = 120 requests can be accepted or queued.
        // The remaining (at least 20) requests MUST be rejected immediately because the queue is full!
        var acquiredCount = results.Count(r => r.Acquired);
        var rejectedCount = results.Count(r => !r.Acquired);

        rejectedCount.Should().BeGreaterThan(0, "Requests beyond TokenLimit + QueueLimit must be rejected");
        acquiredCount.Should().BeLessOrEqualTo(120, "Rate limiter permits must not exceed TokenLimit (20) + QueueLimit (100)");

        // Dispose leases to clean up
        foreach (var r in results)
        {
            r.Lease.Dispose();
        }
    }

    [Fact]
    public async Task RateLimiter_FacilityIsolation_ExhaustingOneFacilityDoesNotBlockAnother()
    {
        // Arrange
        await using var rateLimiter = new PhilHealthRateLimiter(NullLogger<PhilHealthRateLimiter>.Instance);
        var tenantId = Guid.NewGuid();
        var saturatedAccreNo = "H99990001";
        var healthyAccreNo = "H99990002";

        // Act 1: Exhaust saturated facility with 140 requests
        var saturatedTasks = Enumerable.Range(0, 140)
            .Select(async _ => await rateLimiter.AcquireAsync(tenantId, saturatedAccreNo))
            .ToList();

        var saturatedResults = await Task.WhenAll(saturatedTasks);
        var saturatedRejections = saturatedResults.Count(l => !l.IsAcquired);
        saturatedRejections.Should().BeGreaterThan(0);

        // Act 2: Healthy facility acquires immediately
        using var healthyLease = await rateLimiter.AcquireAsync(tenantId, healthyAccreNo);

        // Assert: Healthy facility partition is completely unaffected by saturated facility
        healthyLease.IsAcquired.Should().BeTrue("Independent partition for healthy facility must not be blocked or rejected");

        // Clean up
        foreach (var l in saturatedResults) l.Dispose();
    }

    [Fact]
    public async Task PcapiClient_WhenRateLimiterRejects_ThrowsHttpRequestExceptionWith429TooManyRequests()
    {
        // Arrange
        var tokenCache = Substitute.For<IPhilHealthTokenCache>();
        var rateLimiter = Substitute.For<IPhilHealthRateLimiter>();
        var sandbox = Substitute.For<IPcapiSandboxService>();
        var dataProtection = CreateDataProtection();

        var tenant = new PhilHealthTenant
        {
            TenantId = Guid.NewGuid(),
            AccreditationNumber = "H10000001",
            FacilityName = "Throttled Clinic",
            SoftwareCertificateId = "CERT-429",
            EncryptedSecretKey = "dummy-secret",
            BaseUrl = "https://pcapi.philhealth.gov.ph"
        };

        // Mock RateLimiter to return a rejected lease (IsAcquired == false)
        var failedLease = Substitute.For<System.Threading.RateLimiting.RateLimitLease>();
        failedLease.IsAcquired.Returns(false);
        rateLimiter.AcquireAsync(tenant.TenantId, tenant.AccreditationNumber, Arg.Any<CancellationToken>())
            .Returns(new ValueTask<System.Threading.RateLimiting.RateLimitLease>(failedLease));

        var pcapiClient = new PhilHealthPcapiClient(
            new HttpClient(),
            tokenCache,
            rateLimiter,
            sandbox,
            dataProtection,
            NullLogger<PhilHealthPcapiClient>.Instance);

        var pcuRequest = new PcuStartRequest(
            Pin: "123456789012",
            FirstName: "Juan",
            MiddleName: "Santos",
            LastName: "Dela Cruz",
            Suffix: null,
            BirthDate: "01/15/1990");

        // Act & Assert
        var act = async () => await pcapiClient.StartPcuAsync(pcuRequest, tenant);

        var exception = await act.Should().ThrowAsync<HttpRequestException>();
        exception.Which.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        exception.Which.Message.Should().Contain("429 Rate limit exceeded");
    }

    #endregion
}
