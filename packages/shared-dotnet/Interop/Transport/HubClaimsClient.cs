using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Security.Cryptography;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Interop.Transport;

/// <summary>
/// Patient-carried claim capability. The issuer (clinic) wraps an envelope addressed only by facility TYPE into a
/// single-use token printed/QR'd on the slip; any ClinicEZ facility of that type redeems it and the hub then delivers
/// the claimed envelope into that facility's mailbox (no prior link required: the patient is the consent broker).
/// HTTP mapping: <c>POST /v1/claims</c>, <c>POST /v1/claims/{token}/redeem</c>.
/// </summary>
public interface IHubClaimsClient
{
    Task<ClaimSlipResult> CreateAsync(ClaimSlipRequest request, CancellationToken ct);

    Task<ClaimRedeemResult> RedeemAsync(string token, ClaimRedeemRequest request, CancellationToken ct);
}

public sealed class HubClaimsHttpClient : IHubClaimsClient
{
    private readonly HttpClient _http;

    public HubClaimsHttpClient(HttpClient http, IOptions<InteropOptions> options)
    {
        _http = http;
        var o = options.Value;
        if (_http.BaseAddress is null && !string.IsNullOrWhiteSpace(o.HubUrl))
            _http.BaseAddress = new Uri(o.HubUrl.TrimEnd('/') + "/");
        _http.DefaultRequestHeaders.Remove(HubHttpClient.ClientIdHeader);
        _http.DefaultRequestHeaders.Remove(HubHttpClient.ClientSecretHeader);
        _http.DefaultRequestHeaders.Add(HubHttpClient.ClientIdHeader, o.ClientId);
        _http.DefaultRequestHeaders.Add(HubHttpClient.ClientSecretHeader, o.ClientSecret);
    }

    public async Task<ClaimSlipResult> CreateAsync(ClaimSlipRequest request, CancellationToken ct)
    {
        using var response = await _http.PostAsJsonAsync("v1/claims", request, InteropJson.Options, ct);
        await EnsureAsync(response, ct);
        return await response.Content.ReadFromJsonAsync<ClaimSlipResult>(InteropJson.Options, ct)
               ?? throw new InvalidOperationException("Hub returned an empty claim.");
    }

    public async Task<ClaimRedeemResult> RedeemAsync(string token, ClaimRedeemRequest request, CancellationToken ct)
    {
        using var response = await _http.PostAsJsonAsync($"v1/claims/{Uri.EscapeDataString(token)}/redeem", request, InteropJson.Options, ct);
        await EnsureAsync(response, ct);
        return await response.Content.ReadFromJsonAsync<ClaimRedeemResult>(InteropJson.Options, ct)
               ?? throw new InvalidOperationException("Hub returned an empty claim redemption.");
    }

    private static async Task EnsureAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        var detail = await response.Content.ReadAsStringAsync(ct);
        throw new HubClaimException(response.StatusCode,
            $"Hub claim call failed: {(int)response.StatusCode} {response.ReasonPhrase}. {(detail.Length <= 500 ? detail : detail[..500])}");
    }
}

/// <summary>Claim failures: 404 unknown, 409 already redeemed, 410 expired, 403 not an active facility of the caller's cell, 422 wrong facility type.</summary>
public sealed class HubClaimException : Exception
{
    public System.Net.HttpStatusCode StatusCode { get; }

    public HubClaimException(System.Net.HttpStatusCode statusCode, string message) : base(message) => StatusCode = statusCode;
}

/// <summary>Test double with the real semantics: single-use, delivers the claimed envelope to the redeemer's service mailbox.</summary>
public sealed class InProcessHubClaimsClient : IHubClaimsClient
{
    private sealed record Claim(Guid Id, InteropEnvelope Envelope, DateTime ExpiresAtUtc, bool Redeemed);

    private readonly InProcessHub _hub;
    private readonly ConcurrentDictionary<string, Claim> _claims = new();

    public InProcessHubClaimsClient(InProcessHub hub) => _hub = hub;

    public Task<ClaimSlipResult> CreateAsync(ClaimSlipRequest request, CancellationToken ct)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var expires = DateTime.UtcNow.AddHours(request.TtlHours ?? 72);
        var claim = new Claim(Guid.NewGuid(), request.Envelope, expires, false);
        _claims[token] = claim;
        return Task.FromResult(new ClaimSlipResult(claim.Id, token, expires));
    }

    public Task<ClaimRedeemResult> RedeemAsync(string token, ClaimRedeemRequest request, CancellationToken ct)
    {
        if (!_claims.TryGetValue(token, out var claim))
            throw new HubClaimException(System.Net.HttpStatusCode.NotFound, "Unknown claim.");
        if (claim.ExpiresAtUtc <= DateTime.UtcNow)
            throw new HubClaimException(System.Net.HttpStatusCode.Gone, "Claim expired.");
        if (claim.Redeemed || !_claims.TryUpdate(token, claim with { Redeemed = true }, claim))
            throw new HubClaimException(System.Net.HttpStatusCode.Conflict, "Claim already redeemed.");

        var delivered = claim.Envelope with
        {
            MessageId = Guid.NewGuid(),
            To = Party.ForFacility(request.TenantId, request.FacilityId, claim.Envelope.To.FacilityType!.Value, claim.Envelope.To.Service)
        };
        _hub.Send(delivered);
        return Task.FromResult(new ClaimRedeemResult(
            claim.Id, claim.Envelope.CorrelationId, delivered.MessageId, claim.Envelope.Type,
            claim.Envelope.From.TenantId ?? string.Empty, claim.Envelope.From.FacilityId ?? string.Empty));
    }
}
