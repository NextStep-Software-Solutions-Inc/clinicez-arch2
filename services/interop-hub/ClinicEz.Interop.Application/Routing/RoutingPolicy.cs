using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Security;
using ClinicEz.Interop.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Application.Routing;

/// <summary>
/// Checks that the sending client may speak for the envelope's <c>From</c>:
/// facility clients (CloudService / EdgeCell) only for facilities registered in their own cell; the control plane only as
/// portal/hub; the patient plane only as patients (it relays on their behalf); a platform service only as itself.
/// </summary>
public sealed class OwnershipValidator(IDirectoryStore directory)
{
    /// <summary>Returns null when allowed, otherwise the rejection reason.</summary>
    public async Task<string?> ValidateFromAsync(HubPrincipal client, Party from, CancellationToken ct)
    {
        switch (client.Kind)
        {
            case HubClientKind.ControlPlane:
                return from.Kind == PartyKind.ControlPlane && (from.Service is null or InteropServices.Portal or InteropServices.Hub)
                    ? null
                    : "A control-plane client may only send as the portal or the hub.";

            case HubClientKind.PlatformService:
                return from.Kind == PartyKind.ControlPlane && string.Equals(from.Service, client.Service, StringComparison.Ordinal)
                    ? null
                    : $"A platform-service client may only send as its own service '{client.Service}'.";

            case HubClientKind.PatientPlane:
                var asPatient = from.Kind == PartyKind.Patient && !string.IsNullOrWhiteSpace(from.PatientId);
                var asPatientService = from.Kind == PartyKind.ControlPlane && from.Service == InteropServices.Patient;
                return asPatient || asPatientService
                    ? null
                    : "A patient-plane client may only send as a patient.";

            default:
                if (from.Kind != PartyKind.Facility || string.IsNullOrWhiteSpace(from.TenantId) || string.IsNullOrWhiteSpace(from.FacilityId))
                    return "A facility client must send as a facility (From.TenantId and From.FacilityId are required).";
                var facility = await directory.GetFacilityAsync(from.TenantId, from.FacilityId, ct);
                if (facility is null) return $"Sender {from.Address} is not a registered facility.";
                if (!facility.Active) return $"Sender {from.Address} is inactive.";
                return facility.CellId == client.CellId
                    ? null
                    : $"Sender {from.Address} does not belong to this client's cell.";
        }
    }
}

public enum RouteKind { Reject, Deliver, Forward }

/// <summary>
/// Outcome of routing: reject (with reason), deliver into a local mailbox (optionally recording a conversation
/// so the recipient may reply), or forward to the upstream hub (Local mode only).
/// </summary>
public sealed record RouteDecision(RouteKind Kind, string? Mailbox = null, string? Reason = null, ConversationEntry? Conversation = null)
{
    public static RouteDecision Reject(string reason) => new(RouteKind.Reject, Reason: reason);
    public static RouteDecision Deliver(string mailbox, ConversationEntry? conversation = null) => new(RouteKind.Deliver, mailbox, Conversation: conversation);
    public static RouteDecision Forward() => new(RouteKind.Forward);
}

/// <summary>
/// Routing and cross-tenant policy (plan 4.4 / 4.5 / 4.5.1).
/// <list type="bullet">
/// <item>Facility target: facility -> cell -> mailbox <c>{cell}:{service}</c> (service = <c>To.Service</c> or the facility type's default); an Edge cell's facilities are reached via <c>{cell}:cell-inbox</c>.</item>
/// <item>Patient target: <c>{cloud}:patient</c>. Control-plane target: <c>{cloud}:portal</c> or <c>{cloud}:patient</c> (any client); a platform service (<c>{cloud}:philhealth</c>) from any client but only for its own message types (<see cref="PlatformMessageRules"/>); other cloud-cell services only from control-plane / patient-plane clients.</item>
/// <item>Same tenant: always allowed. Cross-tenant: allowed when the target previously addressed the sender in this correlation (a reply; permitted even if the link was later revoked so in-flight workflows finish), or when an Active link from sender to target covers the message kind and the target is not Private.</item>
/// <item>Control-plane and patient-plane clients are trusted relays and are not link-checked.</item>
/// <item>Local mode: facilities of the local cell are delivered on the LAN; everything else is forwarded to the cloud hub, which is the policy authority (rejected with <c>upstream_disabled</c> when <c>Hub:Upstream:Enabled=false</c>).</item>
/// <item>A facility whose type has no default service is routed by <c>To.Service</c>, otherwise rejected with <c>unknown_facility_type</c>.</item>
/// </list>
/// </summary>
public sealed class RoutingPolicy(IDirectoryStore directory, IMessageStore messages, IOptions<HubOptions> options)
{
    /// <summary>Rejection reason prefix when a facility type has no default service and the sender did not name one.</summary>
    public const string UnknownFacilityType = "unknown_facility_type";

    /// <summary>Rejection reason prefix when a message needs the cloud but the local hub runs air-gapped.</summary>
    public const string UpstreamDisabled = "upstream_disabled";

    /// <summary>Control-plane services any authenticated client may address.</summary>
    private static readonly string[] OpenControlPlaneServices = [InteropServices.Portal, InteropServices.Patient];

    /// <summary>Facility-plane services the control plane / patient plane may address in the cloud cell (never facility clients).</summary>
    /// <summary>Platform services (control-plane parties with a client of their own). Every client may address them, but only with the message types <see cref="PlatformMessageRules"/> allow.</summary>
    private static readonly string[] PlatformServices = [.. InteropServices.PlatformServices];

    private static readonly string[] FacilityPlaneServices =
        [InteropServices.Clinic, InteropServices.Laboratory, InteropServices.Pharmacy, InteropServices.Organization, InteropServices.Billing, InteropServices.Comms];

    public async Task<RouteDecision> RouteAsync(HubPrincipal sender, InteropEnvelope envelope, CancellationToken ct)
    {
        var opt = options.Value;
        var to = envelope.To;

        if (PlatformMessageRules.Check(sender, envelope) is { } platformViolation)
            return RouteDecision.Reject(platformViolation);

        switch (to.Kind)
        {
            case PartyKind.Patient:
                if (string.IsNullOrWhiteSpace(to.PatientId)) return RouteDecision.Reject("To.PatientId is required.");
                if (envelope.From.Kind == PartyKind.Patient) return RouteDecision.Reject("A patient cannot address another patient.");
                return opt.IsLocal
                    ? ForwardUpstream(to)
                    : RouteDecision.Deliver(MailboxNames.For(opt.CloudCellId, InteropServices.Patient));

            case PartyKind.ControlPlane:
                return RouteToControlPlane(sender, to);

            case PartyKind.Facility:
                return await RouteToFacilityAsync(sender, envelope, ct);

            default:
                return RouteDecision.Reject("Unknown To.Kind.");
        }
    }

    /// <summary>
    /// A control-plane party is the portal (default) or a service of the cloud cell: <c>portal</c> and <c>patient</c> may be
    /// addressed by every client (a facility asking the patient plane to redeem a share, the portal feeding patient-api);
    /// facility-plane services only by the control plane and patient plane.
    /// </summary>
    private RouteDecision RouteToControlPlane(HubPrincipal sender, Party to)
    {
        var opt = options.Value;
        var service = to.Service ?? InteropServices.Portal;

        var open = OpenControlPlaneServices.Contains(service, StringComparer.Ordinal);
        var facilityPlane = FacilityPlaneServices.Contains(service, StringComparer.Ordinal);
        var platform = PlatformServices.Contains(service, StringComparer.Ordinal);
        if (!open && !facilityPlane && !platform) return RouteDecision.Reject($"Unknown control-plane service '{to.Service}'.");

        if (facilityPlane && sender.Kind is not (HubClientKind.ControlPlane or HubClientKind.PatientPlane))
            return RouteDecision.Reject($"Facility clients may only address the 'portal' and 'patient' control-plane services, not '{service}'.");

        return opt.IsLocal
            ? ForwardUpstream(to)
            : RouteDecision.Deliver(MailboxNames.For(opt.CloudCellId, service));
    }

    /// <summary>Local mode: the cloud is the authority for everything beyond the edge cell. Air-gapped hubs reject it with a clear reason.</summary>
    private RouteDecision ForwardUpstream(Party to) =>
        options.Value.Upstream.Enabled
            ? RouteDecision.Forward()
            : RouteDecision.Reject($"{UpstreamDisabled}: this edge hub runs without an upstream connection (Hub:Upstream:Enabled=false), so {to.Address} is not reachable.");

    private async Task<RouteDecision> RouteToFacilityAsync(HubPrincipal sender, InteropEnvelope envelope, CancellationToken ct)
    {
        var opt = options.Value;
        var to = envelope.To;
        if (string.IsNullOrWhiteSpace(to.TenantId) || string.IsNullOrWhiteSpace(to.FacilityId))
            return RouteDecision.Reject("To.TenantId and To.FacilityId are required for a facility.");

        var facility = await directory.GetFacilityAsync(to.TenantId, to.FacilityId, ct);

        if (opt.IsLocal)
        {
            if (facility is { Active: true } && facility.CellId == opt.LocalCellId)
            {
                var (localService, localReason) = ServiceFor(facility, to.Service);
                return localService is null
                    ? RouteDecision.Reject(localReason!)
                    : RouteDecision.Deliver(MailboxNames.For(facility.CellId, localService));
            }

            return ForwardUpstream(to);
        }

        if (facility is null || !facility.Active) return RouteDecision.Reject($"Unknown or inactive target facility {to.Address}.");

        var mailbox = await ResolveMailboxAsync(facility, to.Service, ct);
        if (mailbox.Reason is not null) return RouteDecision.Reject(mailbox.Reason);

        var verdict = await AuthorizeAsync(sender, envelope, facility, ct);
        return verdict.Reason is not null
            ? RouteDecision.Reject(verdict.Reason)
            : RouteDecision.Deliver(mailbox.Mailbox!, verdict.Conversation);
    }

    /// <summary>Mailbox for a facility in the cloud directory (no authorization). Used by routing and by claim redemption.</summary>
    public async Task<(string? Mailbox, string? Reason)> ResolveMailboxAsync(HubFacility facility, string? requestedService, CancellationToken ct)
    {
        var cell = await directory.GetCellAsync(facility.CellId, ct);
        if (cell is not { Active: true }) return (null, $"The cell of facility {facility.Key} is unavailable.");

        var (service, reason) = ServiceFor(facility, requestedService);
        if (service is null) return (null, reason);

        return (cell.Kind == CellKind.Edge
            ? MailboxNames.CellInbox(cell.CellId)
            : MailboxNames.For(cell.CellId, service), null);
    }

    /// <summary>
    /// The service mailbox serving a facility: the explicitly requested one, else the facility type's default. A facility type this
    /// hub does not know yet yields the <see cref="UnknownFacilityType"/> reason instead of an exception.
    /// </summary>
    public static (string? Service, string? Reason) ServiceFor(HubFacility facility, string? requested)
    {
        var service = requested;
        if (service is null)
        {
            try
            {
                service = InteropServices.ForFacilityType(facility.FacilityType);
            }
            catch (ArgumentOutOfRangeException)
            {
                return (null, $"{UnknownFacilityType}: facility type '{facility.FacilityType}' of {facility.Key} has no default service; name the target in To.Service.");
            }
        }

        return MailboxNames.IsValidService(service) ? (service, null) : (null, $"Invalid target service '{requested}'.");
    }

    private async Task<(string? Reason, ConversationEntry? Conversation)> AuthorizeAsync(
        HubPrincipal sender, InteropEnvelope envelope, HubFacility target, CancellationToken ct)
    {
        // Control plane and patient plane are authenticated relays; the facility/patient relationship is theirs to enforce.
        if (sender.Kind is HubClientKind.ControlPlane or HubClientKind.PatientPlane || envelope.From.Kind != PartyKind.Facility)
            return (null, null);

        var from = envelope.From;
        if (from.TenantId == target.TenantId) return (null, null);

        if (envelope.Type.StartsWith("comms.", StringComparison.OrdinalIgnoreCase))
            return ($"Cross-tenant messages of type '{envelope.Type}' are prohibited.", null);

        var fromKey = HubFacility.MakeKey(from.TenantId!, from.FacilityId!);

        // A reply on a correlation the target started is always allowed (even if the link was revoked meanwhile).
        if (await messages.HasConversationAsync(envelope.CorrelationId, target.Key, fromKey, ct)) return (null, null);

        var scope = MessageScopes.For(envelope.Type);
        if (scope == LinkScopes.None) return ($"Cross-tenant messages of type '{envelope.Type}' require a reply on an existing correlation.", null);
        if (target.Visibility == FacilityVisibility.Private) return ("The target facility is private.", null);

        var links = await directory.GetActiveLinksBetweenAsync(fromKey, target.Key, ct);
        var allowed = links.Any(l =>
            (l.SourceKey == fromKey && l.Scopes.HasFlag(scope))
            // Result flows back along the link the requester holds (requester = link source).
            || (scope == LinkScopes.Result && l.SourceKey == target.Key && l.Scopes.HasFlag(LinkScopes.Result)));
        return allowed
            ? (null, new ConversationEntry(envelope.CorrelationId, fromKey, target.Key))
            : ($"No active link covering {scope} from {fromKey} to {target.Key}.", null);
    }
}
