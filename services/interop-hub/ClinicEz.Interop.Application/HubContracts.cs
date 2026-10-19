using System.Net;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Interop.Application;

/// <summary>A request the hub refuses; <see cref="StatusCode"/> is returned to the caller.</summary>
public sealed class HubRequestException(HttpStatusCode statusCode, string message) : Exception(message)
{
    public HttpStatusCode StatusCode { get; } = statusCode;

    public static HubRequestException BadRequest(string message) => new(HttpStatusCode.BadRequest, message);
    public static HubRequestException Forbidden(string message) => new(HttpStatusCode.Forbidden, message);
    public static HubRequestException NotFound(string message) => new(HttpStatusCode.NotFound, message);
    public static HubRequestException Conflict(string message) => new(HttpStatusCode.Conflict, message);
}

/// <summary>
/// <c>GET /v1/directory/snapshot</c>: what an edge cell's local hub needs offline (its own facilities, visible partners,
/// the links between them and the cells involved). <see cref="Unchanged"/> means <c>sinceVersion</c> is current and the lists are empty.
/// Otherwise the lists are the complete authoritative set.
/// </summary>
public sealed record DirectorySnapshotDto(
    long Version,
    bool Unchanged,
    IReadOnlyList<DirectoryCellUpsertedPayload> Cells,
    IReadOnlyList<DirectoryFacilityUpsertedPayload> Facilities,
    IReadOnlyList<DirectoryLinkUpsertedPayload> Links);

/// <summary>Body of <c>POST /v1/claims</c>. The envelope is addressed by facility type only (no tenant/facility).</summary>
public sealed record CreateClaimRequest(InteropEnvelope Envelope, int? TtlHours = null);

/// <summary>The token is returned once; the hub keeps only its SHA-256.</summary>
public sealed record CreateClaimResponse(Guid ClaimId, string Token, DateTime ExpiresAtUtc);

/// <summary>Body of <c>POST /v1/claims/{token}/redeem</c>: the facility taking the order.</summary>
public sealed record RedeemClaimRequest(string TenantId, string FacilityId);

public sealed record RedeemClaimResponse(
    Guid ClaimId,
    Guid CorrelationId,
    Guid MessageId,
    string Type,
    string IssuerTenantId,
    string IssuerFacilityId);

/// <summary>Mailbox naming: <c>{cellId}:{service}</c>; an edge cell's single cloud-side queue is <c>{cellId}:cell-inbox</c>.</summary>
public static class MailboxNames
{
    public const string CellInboxService = "cell-inbox";

    /// <summary>In-process wake-up channel (not a mailbox) for the local outbound forwarder.</summary>
    public const string OutboundSignal = "$outbound";

    public static string For(string cellId, string service) => $"{cellId}:{service}";

    public static string CellInbox(string cellId) => For(cellId, CellInboxService);

    /// <summary>Service names that can be read as a normal mailbox.</summary>
    public static bool IsValidService(string? service) =>
        service is { Length: > 0 and <= 32 }
        && service[0] is >= 'a' and <= 'z'
        && service.All(c => c is >= 'a' and <= 'z' or >= '0' and <= '9' or '-')
        && service != CellInboxService
        && service != InteropServices.Hub;
}

/// <summary>Maps an envelope type to the link scope a cross-tenant sender needs.</summary>
public static class MessageScopes
{
    public static LinkScopes For(string type)
    {
        if (type.StartsWith("lab.order.", StringComparison.Ordinal)) return LinkScopes.LabOrder;
        if (type.StartsWith("rx.", StringComparison.Ordinal)) return LinkScopes.Prescription;
        if (type.Contains("referral", StringComparison.Ordinal)) return LinkScopes.Referral;
        if (type.StartsWith("lab.result.", StringComparison.Ordinal)) return LinkScopes.Result;
        return LinkScopes.None;
    }
}
