using System.Net.Http.Json;
using System.Text;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Infrastructure.Upstream;

/// <summary>
/// A local hub's outbound-only HTTPS connection to the cloud hub. Uses the SDK's wire records so the cloud hub and the
/// SDK clients agree byte-for-byte; adds the edge-only endpoints (cell-inbox, directory snapshot).
/// </summary>
public sealed class UpstreamHubClient(IHttpClientFactory httpClients, IOptions<HubOptions> options) : IUpstreamHub
{
    public const string HttpClientName = "hub-upstream";

    public async Task<IReadOnlyList<SendResult>> SendAsync(IReadOnlyList<InteropEnvelope> envelopes, CancellationToken ct)
    {
        using var response = await SendRequestAsync(HttpMethod.Post, "v1/messages", JsonContent.Create(new HubHttpClient.SendRequest(envelopes), options: InteropJson.Options), ct);
        var body = await response.Content.ReadFromJsonAsync<HubHttpClient.SendResponse>(InteropJson.Options, ct)
                   ?? throw new InvalidOperationException("Upstream hub returned an empty send response.");
        return body.Results;
    }

    public async Task<IReadOnlyList<PulledMessage>> PullCellInboxAsync(int max, int waitSeconds, CancellationToken ct)
    {
        using var response = await SendRequestAsync(HttpMethod.Get, $"v1/cell-inbox?max={max}&waitSeconds={waitSeconds}", null, ct);
        var body = await response.Content.ReadFromJsonAsync<HubHttpClient.PullResponse>(InteropJson.Options, ct)
                   ?? throw new InvalidOperationException("Upstream hub returned an empty cell-inbox response.");
        return body.Messages;
    }

    public async Task AckCellInboxAsync(IReadOnlyList<Guid> deliveryIds, CancellationToken ct)
    {
        using var response = await SendRequestAsync(HttpMethod.Post, "v1/cell-inbox/ack", JsonContent.Create(new HubHttpClient.AckRequest(deliveryIds), options: InteropJson.Options), ct);
    }

    public async Task NackCellInboxAsync(IReadOnlyList<NackItem> items, CancellationToken ct)
    {
        using var response = await SendRequestAsync(HttpMethod.Post, "v1/cell-inbox/nack", JsonContent.Create(new HubHttpClient.NackRequest(items), options: InteropJson.Options), ct);
    }

    public async Task<DirectorySnapshotDto> GetSnapshotAsync(long sinceVersion, CancellationToken ct)
    {
        using var response = await SendRequestAsync(HttpMethod.Get, $"v1/directory/snapshot?sinceVersion={sinceVersion}", null, ct);
        return await response.Content.ReadFromJsonAsync<DirectorySnapshotDto>(InteropJson.Options, ct)
               ?? throw new InvalidOperationException("Upstream hub returned an empty directory snapshot.");
    }

    public async Task<UpstreamResponse> ForwardAsync(HttpMethod method, string pathAndQuery, string? jsonBody, CancellationToken ct)
    {
        using var content = jsonBody is null ? null : new StringContent(jsonBody, Encoding.UTF8, "application/json");
        using var response = await SendRawAsync(method, pathAndQuery, content, ct);
        return new UpstreamResponse((int)response.StatusCode, await response.Content.ReadAsStringAsync(ct));
    }

    private async Task<HttpResponseMessage> SendRequestAsync(HttpMethod method, string path, HttpContent? content, CancellationToken ct)
    {
        var response = await SendRawAsync(method, path, content, ct);
        if (response.IsSuccessStatusCode) return response;

        var detail = await response.Content.ReadAsStringAsync(ct);
        var status = response.StatusCode;
        response.Dispose();
        throw new HttpRequestException(
            $"Upstream hub call failed: {(int)status}. {(detail.Length <= 500 ? detail : detail[..500])}",
            inner: null,
            statusCode: status);
    }

    private async Task<HttpResponseMessage> SendRawAsync(HttpMethod method, string path, HttpContent? content, CancellationToken ct)
    {
        var upstream = options.Value.Upstream;
        using var request = new HttpRequestMessage(method, path) { Content = content };
        request.Headers.Add(HubHttpClient.ClientIdHeader, upstream.ClientId);
        request.Headers.Add(HubHttpClient.ClientSecretHeader, upstream.ClientSecret);
        return await httpClients.CreateClient(HttpClientName).SendAsync(request, ct);
    }
}
