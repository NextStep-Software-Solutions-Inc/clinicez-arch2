using System.Net;
using System.Net.Http.Json;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Interop.Tests.Support;

/// <summary>Raw-wire helpers for endpoints the SDK client does not cover (directory, claims, cell-inbox).</summary>
public static class HubHttp
{
    public static Task<HttpResponseMessage> PostJsonAsync<T>(this HttpClient client, string url, T body) =>
        client.PostAsJsonAsync(url, body, InteropJson.Options);

    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response)
    {
        response.IsSuccessStatusCode.Should().BeTrue(await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<T>(InteropJson.Options))!;
    }

    /// <summary><c>GET /v1/directory/facilities</c> as one client; the tenant goes in the header (or the query when <paramref name="tenantInQuery"/>).</summary>
    public static async Task<HttpResponseMessage> GetFacilitiesAsync(this HubApp hub, string clientId, string? tenant = null, string query = "", bool tenantInQuery = false)
    {
        var http = hub.RawAs(clientId);
        var url = "/v1/directory/facilities" + (query.Length > 0 ? "?" + query : string.Empty);
        if (tenant is not null && tenantInQuery) url += (query.Length > 0 ? "&" : "?") + "tenantId=" + tenant;
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        if (tenant is not null && !tenantInQuery) request.Headers.Add("X-Hub-Tenant", tenant);
        return await http.SendAsync(request);
    }

    public static async Task<List<DirectoryFacilityDto>> ListFacilitiesAsync(this HubApp hub, string clientId, string? tenant = null, string query = "") =>
        await (await hub.GetFacilitiesAsync(clientId, tenant, query)).ReadAsync<List<DirectoryFacilityDto>>();

    public static async Task<IReadOnlyList<PulledMessage>> PullCellInboxAsync(this HubApp hub, string clientId = "edge-hub", int max = 50)
    {
        var response = await hub.RawAs(clientId).GetAsync($"/v1/cell-inbox?max={max}");
        return (await response.ReadAsync<HubHttpClient.PullResponse>()).Messages;
    }

    public static async Task<HttpResponseMessage> AckCellInboxAsync(this HubApp hub, string clientId, params Guid[] deliveryIds) =>
        await hub.RawAs(clientId).PostJsonAsync("/v1/cell-inbox/ack", new HubHttpClient.AckRequest(deliveryIds));

    public static async Task<MaintenanceReport> MaintainAsync(this HubApp hub)
    {
        using var scope = hub.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IMessageStore>().RunMaintenanceAsync(CancellationToken.None);
    }

    public static Task<HubMessage> MessageRowAsync(this HubApp hub, Guid messageId) =>
        hub.DbAsync(db => db.Messages.AsNoTracking().SingleAsync(m => m.MessageId == messageId));

    public static Task<int> MessageCountAsync(this HubApp hub) => hub.DbAsync(db => db.Messages.CountAsync());

    public static Task<int> OutboundCountAsync(this HubApp hub) => hub.DbAsync(db => db.Outbound.CountAsync());

    /// <summary>Asserts that a client may not use the SDK call (the hub answered with this status).</summary>
    public static async Task ShouldFailWithAsync(this Task call, HttpStatusCode status)
    {
        var failure = await Assert.ThrowsAsync<HttpRequestException>(() => call);
        failure.StatusCode.Should().Be(status);
    }
}
