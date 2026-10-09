using System.Net.Http.Json;
using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Interop.Contracts;

/// <summary>Who may see a facility in the hub directory. Private is the default.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum FacilityVisibility
{
    /// <summary>Only the owning workspace's facilities can address it.</summary>
    Private,
    /// <summary>Visible to facilities that hold an Active link to it.</summary>
    Network,
    /// <summary>Listed in the public directory; others may request a link.</summary>
    Public
}

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum LinkStatus { Pending, Active, Rejected, Revoked }

/// <summary>Kinds of work a link authorises (flags so one link can carry several).</summary>
[Flags]
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum LinkScopes
{
    None = 0,
    LabOrder = 1,
    Prescription = 2,
    Referral = 4,
    Result = 8,
    All = LabOrder | Prescription | Referral | Result
}

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum CellKind
{
    /// <summary>The ClinicEZ cloud shared cell: facilities of every SharedCloud tenant. Its hub is the cloud hub.</summary>
    Cloud,
    /// <summary>One per on-prem tenant site; has a local hub federated to the cloud hub.</summary>
    Edge
}

/// <summary>Portal -&gt; hub (<see cref="InteropTypes.DirectoryCellUpserted"/>).</summary>
public sealed record DirectoryCellUpsertedPayload
{
    public string CellId { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public CellKind Kind { get; init; }
    /// <summary>Owning tenant for an edge cell; null for the cloud cell.</summary>
    public string? TenantId { get; init; }
    public bool Active { get; init; } = true;
}

/// <summary>Portal -&gt; hub (<see cref="InteropTypes.DirectoryFacilityUpserted"/>).</summary>
public sealed record DirectoryFacilityUpsertedPayload
{
    public string TenantId { get; init; } = string.Empty;
    public string FacilityId { get; init; } = string.Empty;
    public FacilityType FacilityType { get; init; }
    public string CellId { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string? BranchId { get; init; }
    public string? City { get; init; }
    public FacilityVisibility Visibility { get; init; } = FacilityVisibility.Private;
    public bool AcceptsExternalRequests { get; init; }
    /// <summary>False removes the facility from routing and the directory.</summary>
    public bool Active { get; init; } = true;
}

/// <summary>Portal -&gt; hub (<see cref="InteropTypes.DirectoryLinkUpserted"/>).</summary>
public sealed record DirectoryLinkUpsertedPayload
{
    public Guid LinkId { get; init; }
    public string SourceTenantId { get; init; } = string.Empty;
    public string SourceFacilityId { get; init; } = string.Empty;
    public string TargetTenantId { get; init; } = string.Empty;
    public string TargetFacilityId { get; init; } = string.Empty;
    public LinkStatus Status { get; init; } = LinkStatus.Active;
    public LinkScopes Scopes { get; init; } = LinkScopes.All;
}

/// <summary>What <c>GET /v1/directory/facilities</c> returns for one facility.</summary>
public sealed record DirectoryFacilityDto(
    string TenantId,
    string FacilityId,
    FacilityType FacilityType,
    string DisplayName,
    string? City,
    FacilityVisibility Visibility,
    bool AcceptsExternalRequests,
    bool IsOwnWorkspace,
    LinkStatus? LinkStatus);

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum HubClientKind
{
    /// <summary>A cloud service acting for the cloud cell (clinic-api, lab-api, patient-api ...).</summary>
    CloudService,
    /// <summary>A facility service (or the local hub) inside an edge cell.</summary>
    EdgeCell,
    /// <summary>portal-api: may call the hub admin API and publish <c>directory.*</c>.</summary>
    ControlPlane,
    /// <summary>patient-api: may address any <see cref="PartyKind.Patient"/> mailbox and relay to facilities for patients.</summary>
    PatientPlane
}

/// <summary>
/// Body of <c>POST /v1/admin/cells/{cellId}/clients</c>. <see cref="PublicKey"/> (PEM or base64 of PEM, ECDSA P-256) registers a
/// signing key the caller already holds; without it the hub generates a key pair and returns the private half once.
/// </summary>
public sealed record CreateHubClientRequest(string Service, HubClientKind Kind, string? PublicKey = null);

/// <summary>
/// Returned once at creation / rotation. The hub stores only a hash of <see cref="ClientSecret"/> and the PUBLIC signing key.
/// <see cref="SigningKey"/> is the generated private signing key (base64 of PEM, the <c>Messaging:SigningKey</c> value); it is
/// null when the caller registered its own public key.
/// </summary>
public sealed record HubClientCredentials(string ClientId, string ClientSecret, string CellId, string Service, HubClientKind Kind, string? SigningKey = null);

/// <summary>
/// Control-plane client of the hub admin API (used by portal-api to onboard cells/clients). HTTP mapping:
/// <c>PUT /v1/admin/cells/{cellId}</c>, <c>POST /v1/admin/cells/{cellId}/clients</c>,
/// <c>POST /v1/admin/clients/{clientId}/rotate</c> (new secret and new signing key pair), <c>DELETE /v1/admin/clients/{clientId}</c>.\n/// Requires a ControlPlane client.
/// </summary>
public interface IHubAdminClient
{
    Task UpsertCellAsync(DirectoryCellUpsertedPayload cell, CancellationToken ct);
    Task<HubClientCredentials> CreateClientAsync(string cellId, CreateHubClientRequest request, CancellationToken ct);
    Task<HubClientCredentials> RotateClientAsync(string clientId, CancellationToken ct);
    Task RevokeClientAsync(string clientId, CancellationToken ct);
}

public sealed class HubAdminHttpClient : IHubAdminClient
{
    private readonly HttpClient _http;

    public HubAdminHttpClient(HttpClient http, IOptions<InteropOptions> options)
    {
        _http = http;
        var o = options.Value;
        if (_http.BaseAddress is null && !string.IsNullOrWhiteSpace(o.HubUrl))
            _http.BaseAddress = new Uri(o.HubUrl.TrimEnd('/') + "/");
        _http.DefaultRequestHeaders.Remove(Transport.HubHttpClient.ClientIdHeader);
        _http.DefaultRequestHeaders.Remove(Transport.HubHttpClient.ClientSecretHeader);
        _http.DefaultRequestHeaders.Add(Transport.HubHttpClient.ClientIdHeader, o.ClientId);
        _http.DefaultRequestHeaders.Add(Transport.HubHttpClient.ClientSecretHeader, o.ClientSecret);
    }

    public async Task UpsertCellAsync(DirectoryCellUpsertedPayload cell, CancellationToken ct)
    {
        using var response = await _http.PutAsJsonAsync($"v1/admin/cells/{Uri.EscapeDataString(cell.CellId)}", cell, InteropJson.Options, ct);
        await EnsureAsync(response, ct);
    }

    public async Task<HubClientCredentials> CreateClientAsync(string cellId, CreateHubClientRequest request, CancellationToken ct)
    {
        using var response = await _http.PostAsJsonAsync($"v1/admin/cells/{Uri.EscapeDataString(cellId)}/clients", request, InteropJson.Options, ct);
        await EnsureAsync(response, ct);
        return await response.Content.ReadFromJsonAsync<HubClientCredentials>(InteropJson.Options, ct)
               ?? throw new InvalidOperationException("Hub returned empty client credentials.");
    }

    public async Task<HubClientCredentials> RotateClientAsync(string clientId, CancellationToken ct)
    {
        using var response = await _http.PostAsync($"v1/admin/clients/{Uri.EscapeDataString(clientId)}/rotate", null, ct);
        await EnsureAsync(response, ct);
        return await response.Content.ReadFromJsonAsync<HubClientCredentials>(InteropJson.Options, ct)
               ?? throw new InvalidOperationException("Hub returned empty client credentials.");
    }

    public async Task RevokeClientAsync(string clientId, CancellationToken ct)
    {
        using var response = await _http.DeleteAsync($"v1/admin/clients/{Uri.EscapeDataString(clientId)}", ct);
        await EnsureAsync(response, ct);
    }

    private static async Task EnsureAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        var detail = await response.Content.ReadAsStringAsync(ct);
        throw new HttpRequestException(
            $"Hub admin call failed: {(int)response.StatusCode} {response.ReasonPhrase}. {(detail.Length <= 500 ? detail : detail[..500])}",
            inner: null,
            statusCode: response.StatusCode);
    }
}

/// <summary>
/// What <c>GET /v1/keys/{clientId}</c> returns: the public signing key registered for a hub client, so receivers can verify
/// envelope signatures. Public keys are not secret; any authenticated client may read them.
/// </summary>
public sealed record HubSignerKey(string ClientId, string CellId, string Service, HubClientKind Kind, string? PublicKey, bool Revoked);
