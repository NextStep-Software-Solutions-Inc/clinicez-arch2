using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Security;

/// <summary>
/// Challenger 2 Milestone M1 Adversarial Suite:
/// Stress-tests thread-safety and key-caching behavior of CommsTicketValidator under high
/// concurrent load. Verifies race-condition freedom, cryptographic verification consistency,
/// and cache efficiency during stampedes.
/// </summary>
public class CommsTicketConcurrencyAdversarialTests
{
    private readonly string _privateKeyPem;
    private readonly string _publicKeyPem;
    private readonly string _clientId = "clinic-concurrency-01";
    private readonly string _tenantId = "tenant-conc-1";
    private readonly string _facilityId = "fac-conc-1";

    public CommsTicketConcurrencyAdversarialTests()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        _privateKeyPem = ecdsa.ExportECPrivateKeyPem();
        _publicKeyPem = ecdsa.ExportSubjectPublicKeyInfoPem();
    }

    [Fact]
    public void ConcurrentValidate_UnderHeavyMultiThreadedLoad_IsThreadSafeAndConsistent()
    {
        // Issue valid ticket
        var (validTicket, _) = CommsTicketSigner.IssueTicket(
            _clientId, _privateKeyPem, "staff-01", "Dr. Cruz", _tenantId, _facilityId, null, [CommsPermissions.MessagingRead]);

        // Issue expired ticket
        var (expiredTicket, _) = CommsTicketSigner.IssueTicket(
            _clientId, _privateKeyPem, "staff-02", "Dr. Reyes", _tenantId, _facilityId, null, [CommsPermissions.MessagingRead],
            lifetime: TimeSpan.FromSeconds(1));

        // Create tampered ticket by modifying staff id in valid payload
        var parts = validTicket.Split('.');
        var payloadJson = System.Text.Encoding.UTF8.GetString(Base64UrlHelper.Decode(parts[0]));
        var tamperedJson = payloadJson.Replace("staff-01", "hacker-01");
        var tamperedPayload = Base64UrlHelper.Encode(System.Text.Encoding.UTF8.GetBytes(tamperedJson));
        var tamperedTicket = $"{tamperedPayload}.{parts[1]}";

        const int iterations = 1000;
        var validSuccessCount = 0;
        var expiredFailCount = 0;
        var tamperedFailCount = 0;
        var exceptions = new ConcurrentBag<Exception>();

        Parallel.For(0, iterations, new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount * 4 }, i =>
        {
            try
            {
                var mod = i % 3;
                if (mod == 0)
                {
                    var res = CommsTicketValidator.Validate(validTicket, _publicKeyPem, _tenantId, _facilityId);
                    if (res.IsValid && res.Payload?.Sub == "staff-01")
                    {
                        Interlocked.Increment(ref validSuccessCount);
                    }
                }
                else if (mod == 1)
                {
                    // Validate expired ticket with future timestamp
                    var future = DateTimeOffset.UtcNow.AddMinutes(10);
                    var res = CommsTicketValidator.Validate(expiredTicket, _publicKeyPem, _tenantId, _facilityId, now: future);
                    if (!res.IsValid && res.ErrorMessage!.Contains("expired"))
                    {
                        Interlocked.Increment(ref expiredFailCount);
                    }
                }
                else
                {
                    var res = CommsTicketValidator.Validate(tamperedTicket, _publicKeyPem, _tenantId, _facilityId);
                    if (!res.IsValid && res.ErrorMessage!.Contains("signature"))
                    {
                        Interlocked.Increment(ref tamperedFailCount);
                    }
                }
            }
            catch (Exception ex)
            {
                exceptions.Add(ex);
            }
        });

        exceptions.Should().BeEmpty("no exceptions must be thrown during concurrent ticket validation");
        validSuccessCount.Should().Be(iterations / 3 + (iterations % 3 > 0 ? 1 : 0));
        expiredFailCount.Should().Be(iterations / 3 + (iterations % 3 > 1 ? 1 : 0));
        tamperedFailCount.Should().Be(iterations / 3);
    }

    [Fact]
    public async Task ConcurrentValidateAsync_WithCachingKeyClient_CollapsesStampedeAndEnsuresThreadSafety()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId, _privateKeyPem, "staff-01", "Dr. Cruz", _tenantId, _facilityId, null, [CommsPermissions.MessagingRead]);

        var signerKey = new HubSignerKey(_clientId, "cell-1", "clinic", HubClientKind.CloudService, _publicKeyPem, false);
        var innerClient = new CountingHubKeyClient(new Dictionary<string, HubSignerKey> { [_clientId] = signerKey });
        var cachedClient = new CachingHubKeyClient(innerClient, TimeSpan.FromMinutes(5));

        const int concurrentCallers = 200;
        var tasks = new Task<CommsTicketValidationResult>[concurrentCallers];

        for (var i = 0; i < concurrentCallers; i++)
        {
            tasks[i] = Task.Run(() => CommsTicketValidator.ValidateAsync(ticket, cachedClient, _tenantId, _facilityId));
        }

        var results = await Task.WhenAll(tasks);

        results.Should().HaveCount(concurrentCallers);
        results.Should().OnlyContain(r => r.IsValid, "all concurrent validations must succeed");

        // With single-flight lazy caching, exactly one call is made to the underlying client
        innerClient.CallCount.Should().Be(1, "caching key client with single-flight coalescing must collapse concurrent lookup stampede to exactly 1 call");
    }

    [Fact]
    public async Task KeyRevocation_PropagatesProperly_WhenCacheExpiresOrRefreshes()
    {
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            _clientId, _privateKeyPem, "staff-01", "Dr. Cruz", _tenantId, _facilityId, null, [CommsPermissions.MessagingRead]);

        var keyMap = new Dictionary<string, HubSignerKey>
        {
            [_clientId] = new HubSignerKey(_clientId, "cell-1", "clinic", HubClientKind.CloudService, _publicKeyPem, false)
        };
        var innerClient = new CountingHubKeyClient(keyMap);
        // Short TTL for testing cache invalidation
        var cachedClient = new CachingHubKeyClient(innerClient, TimeSpan.FromMilliseconds(50));

        // 1. Initially valid
        var res1 = await CommsTicketValidator.ValidateAsync(ticket, cachedClient, _tenantId, _facilityId);
        res1.IsValid.Should().BeTrue();

        // 2. Revoke the key in the source
        keyMap[_clientId] = new HubSignerKey(_clientId, "cell-1", "clinic", HubClientKind.CloudService, _publicKeyPem, true);

        // Wait for short TTL cache expiry
        await Task.Delay(100);

        // 3. Subsequent validation must observe revocation
        var res2 = await CommsTicketValidator.ValidateAsync(ticket, cachedClient, _tenantId, _facilityId);
        res2.IsValid.Should().BeFalse();
        res2.ErrorMessage.Should().Contain("revoked");
    }

    [Fact]
    public void ExpirationClockSkewBoundary_EvaluatesDeterministicallyUnderConcurrency()
    {
        var now = DateTimeOffset.UtcNow;
        var payload = new CommsTicketPayload
        {
            Sub = "staff-boundary",
            Name = "Dr. Boundary",
            TenantId = _tenantId,
            FacilityId = _facilityId,
            Permissions = [CommsPermissions.MessagingRead],
            Iss = _clientId,
            Iat = now.ToUnixTimeSeconds(),
            Nbf = now.ToUnixTimeSeconds(),
            Exp = now.AddMinutes(5).ToUnixTimeSeconds(),
            Jti = Guid.NewGuid().ToString("N")
        };
        var ticket = CommsTicketSigner.Sign(payload, _privateKeyPem);

        // 30 seconds clock skew tolerance:
        // Valid at exp + 29s
        // Invalid at exp + 31s
        var at29SecSkew = now.AddMinutes(5).AddSeconds(29);
        var at31SecSkew = now.AddMinutes(5).AddSeconds(31);

        Parallel.For(0, 100, i =>
        {
            var validRes = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: at29SecSkew);
            validRes.IsValid.Should().BeTrue();

            var invalidRes = CommsTicketValidator.Validate(ticket, _publicKeyPem, _tenantId, _facilityId, now: at31SecSkew);
            invalidRes.IsValid.Should().BeFalse();
            invalidRes.ErrorMessage.Should().Contain("expired");
        });
    }

    private sealed class CountingHubKeyClient(Dictionary<string, HubSignerKey> keys) : IHubKeyClient
    {
        private int _callCount;
        public int CallCount => _callCount;

        public Task<HubSignerKey?> GetSignerKeyAsync(string clientId, CancellationToken ct)
        {
            Interlocked.Increment(ref _callCount);
            return Task.FromResult(keys.TryGetValue(clientId, out var key) ? key : null);
        }
    }

    private sealed class CachingHubKeyClient(IHubKeyClient inner, TimeSpan ttl) : IHubKeyClient
    {
        private sealed record CacheEntry(HubSignerKey? Key, DateTime ExpiresAtUtc);
        private readonly ConcurrentDictionary<string, Lazy<Task<CacheEntry>>> _cache = new();

        public async Task<HubSignerKey?> GetSignerKeyAsync(string clientId, CancellationToken ct)
        {
            while (true)
            {
                var now = DateTime.UtcNow;
                var lazy = _cache.GetOrAdd(clientId, id => new Lazy<Task<CacheEntry>>(async () =>
                {
                    var key = await inner.GetSignerKeyAsync(id, ct);
                    return new CacheEntry(key, DateTime.UtcNow.Add(ttl));
                }));

                var entry = await lazy.Value;
                if (entry.ExpiresAtUtc > now)
                {
                    return entry.Key;
                }

                // Expired: remove the stale entry and loop to re-fetch
                ((ICollection<KeyValuePair<string, Lazy<Task<CacheEntry>>>>)_cache).Remove(new KeyValuePair<string, Lazy<Task<CacheEntry>>>(clientId, lazy));
            }
        }
    }
}
