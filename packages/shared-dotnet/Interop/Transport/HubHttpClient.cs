using System.Net.Http.Json;
using System.Text.Json;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Interop.Transport;

/// <summary>
/// Talks to a hub over HTTPS. Outbound only: this is how on-prem facilities reach the cloud
/// without opening any inbound port.
/// </summary>
public sealed class HubHttpClient : IHubClient, IHubKeyClient
{
    public const string ClientIdHeader = "X-Hub-Client";
    public const string ClientSecretHeader = "X-Hub-Secret";

    private readonly HttpClient _http;

    public HubHttpClient(HttpClient http, IOptions<InteropOptions> options)
    {
        _http = http;
        var o = options.Value;
        if (_http.BaseAddress is null && !string.IsNullOrWhiteSpace(o.HubUrl))
            _http.BaseAddress = new Uri(o.HubUrl.TrimEnd('/') + "/");
        _http.DefaultRequestHeaders.Remove(ClientIdHeader);
        _http.DefaultRequestHeaders.Remove(ClientSecretHeader);
        _http.DefaultRequestHeaders.Add(ClientIdHeader, o.ClientId);
        _http.DefaultRequestHeaders.Add(ClientSecretHeader, o.ClientSecret);
        // Long-poll waits up to PollWaitSeconds on the server; leave headroom.
        _http.Timeout = TimeSpan.FromSeconds(Math.Max(30, o.PollWaitSeconds + 25));
    }

    public async Task<IReadOnlyList<SendResult>> SendAsync(IReadOnlyList<InteropEnvelope> envelopes, CancellationToken ct)
    {
        using var response = await _http.PostAsJsonAsync("v1/messages", new SendRequest(envelopes), InteropJson.Options, ct);
        await EnsureSuccessAsync(response, ct);
        var body = await response.Content.ReadFromJsonAsync<SendResponse>(InteropJson.Options, ct)
                   ?? throw new InvalidOperationException("Hub returned an empty send response.");
        return body.Results;
    }

    public async Task<IReadOnlyList<PulledMessage>> PullAsync(string service, int max, int waitSeconds, CancellationToken ct)
    {
        var url = $"v1/inbox?service={Uri.EscapeDataString(service)}&max={max}&waitSeconds={waitSeconds}";
        using var response = await _http.GetAsync(url, ct);
        await EnsureSuccessAsync(response, ct);
        var body = await response.Content.ReadFromJsonAsync<PullResponse>(InteropJson.Options, ct)
                   ?? throw new InvalidOperationException("Hub returned an empty inbox response.");
        return body.Messages;
    }

    public async Task AckAsync(IReadOnlyList<Guid> deliveryIds, CancellationToken ct)
    {
        if (deliveryIds.Count == 0) return;
        using var response = await _http.PostAsJsonAsync("v1/inbox/ack", new AckRequest(deliveryIds), InteropJson.Options, ct);
        await EnsureSuccessAsync(response, ct);
    }

    public async Task NackAsync(IReadOnlyList<NackItem> items, CancellationToken ct)
    {
        if (items.Count == 0) return;
        using var response = await _http.PostAsJsonAsync("v1/inbox/nack", new NackRequest(items), InteropJson.Options, ct);
        await EnsureSuccessAsync(response, ct);
    }

    public async Task<HubSignerKey?> GetSignerKeyAsync(string clientId, CancellationToken ct)
    {
        using var response = await _http.GetAsync($"v1/keys/{Uri.EscapeDataString(clientId)}", ct);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
        await EnsureSuccessAsync(response, ct);
        return await response.Content.ReadFromJsonAsync<HubSignerKey>(InteropJson.Options, ct);
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        var detail = await response.Content.ReadAsStringAsync(ct);
        throw new HttpRequestException(
            $"Hub call failed: {(int)response.StatusCode} {response.ReasonPhrase}. {Truncate(detail)}",
            inner: null,
            statusCode: response.StatusCode);
    }

    private static string Truncate(string s) => s.Length <= 500 ? s : s[..500];

    // Wire DTOs (shared with services/interop-hub, which mirrors these shapes).
    public sealed record SendRequest(IReadOnlyList<InteropEnvelope> Messages);
    public sealed record SendResponse(IReadOnlyList<SendResult> Results);
    public sealed record PullResponse(IReadOnlyList<PulledMessage> Messages);
    public sealed record AckRequest(IReadOnlyList<Guid> DeliveryIds);
    public sealed record NackRequest(IReadOnlyList<NackItem> Items);
}
