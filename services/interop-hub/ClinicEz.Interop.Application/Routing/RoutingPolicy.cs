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
/// portal/hub; the patient plane only as patients (it relays on their behalf).
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
/// <item>Patient target: <c>{cloud}:patient</c>. Control-plane target: <c>{cloud}:portal</c>.</item>
/// <item>Same tenant: always allowed. Cross-tenant: allowed when the target previously addressed the sender in this correlation (a reply; permitted even if the link was later revoked so in-flight workflows finish), or when an Active link from sender to target covers the message kind and the target is not Private.</item>
/// <item>Control-plane and patient-plane clients are trusted relays and are not link-checked.</item>
/// <item>Local mode: facilities of the local cell are delivered on the LAN; everything else is forwarded to the cloud hub, which is the policy authority.</item>
/// </list>
/// </summary>
public sealed class RoutingPolicy(IDirectoryStore directory, IMessageStore messages, IOptions<HubOptions> options)
{
    public async Task<RouteDecision> RouteAsync(HubPrincipal sender, InteropEnvelope envelope, CancellationToken ct)
    {
        var opt = options.Value;
        var to = envelope.To;

        switch (to.Kind)
        {
            case PartyKind.Patient:
                if (string.IsNullOrWhiteSpace(to.PatientId)) return RouteDecision.Reject("To.PatientId is required.");
                if (envelope.From.Kind == PartyKind.Patient) return RouteDecision.Reject("A patient cannot address another patient.");
                return opt.IsLocal
                    ? RouteDecision.Forward()
                    : RouteDecision.Deliver(MailboxNames.For(opt.CloudCellId, InteropServices.Patient));

            case PartyKind.ControlPlane:
                if ((to.Service ?? InteropServices.Portal) != InteropServices.Portal)
                    return RouteDecision.Reject($"Unknown control-plane service '{to.Service}'.");
                return opt.IsLocal
                    ? RouteDecision.Forward()
                    : RouteDecision.Deliver(MailboxNames.For(opt.CloudCellId, InteropServices.Portal));

            case PartyKind.Facility:
                return await RouteToFacilityAsync(sender, envelope, ct);

            default:
                return RouteDecision.Reject("Unknown To.Kind.");
        }
    }

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
                var localService = ServiceFor(facility, to);
                return localService is null
                    ? RouteDecision.Reject($"Invalid target service '{to.Service}'.")
                    : RouteDecision.Deliver(MailboxNames.For(facility.CellId, localService));
            }

            return RouteDecision.Forward();
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

        var service = ServiceFor(facility, requestedService);
        if (service is null) return (null, $"Invalid target service '{requestedService}'.");

        return (cell.Kind == CellKind.Edge
            ? MailboxNames.CellInbox(cell.CellId)
            : MailboxNames.For(cell.CellId, service), null);
    }

    private static string? ServiceFor(HubFacility facility, Party to) => ServiceFor(facility, to.Service);

    private static string? ServiceFor(HubFacility facility, string? requested)
    {
        var service = requested ?? InteropServices.ForFacilityType(facility.FacilityType);
        return MailboxNames.IsValidService(service) ? service : null;
    }

    private async Task<(string? Reason, ConversationEntry? Conversation)> AuthorizeAsync(
        HubPrincipal sender, InteropEnvelope envelope, HubFacility target, CancellationToken ct)
    {
        // Control plane and patient plane are authenticated relays; the facility/patient relationship is theirs to enforce.
        if (sender.Kind is HubClientKind.ControlPlane or HubClientKind.PatientPlane || envelope.From.Kind != PartyKind.Facility)
            return (null, null);

        var from = envelope.From;
        if (from.TenantId == target.TenantId) return (null, null);

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
