using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Interop.Application.Security;

namespace ClinicEz.Interop.Application.Routing;

/// <summary>
/// Who may send which <c>philhealth.*</c> message to whom. The PhilHealth proxy is a platform service of the cloud cell with a
/// hub client of its own (<see cref="HubClientKind.PlatformService"/>); these rules keep it a narrow door:
/// <list type="bullet">
/// <item>facility -&gt; proxy: <c>philhealth.request</c> only, and only from a facility client (never another platform service or the portal);</item>
/// <item>proxy -&gt; facility: <c>philhealth.response</c> only;</item>
/// <item>proxy -&gt; portal: the config request and upsert only; portal -&gt; proxy: their replies only (this is the one path carrying credentials, and it is addressed to the proxy alone);</item>
/// <item>the proxy sends nothing but <c>philhealth.*</c>, and nothing but those types may be addressed to it.</item>
/// </list>
/// Replies need no link: the proxy and the portal are trusted platform parties and a response goes back to whichever facility asked.
/// </summary>
public static class PlatformMessageRules
{
    /// <summary>Returns null when the envelope obeys the rules, otherwise the rejection reason.</summary>
    public static string? Check(HubPrincipal sender, InteropEnvelope envelope)
    {
        var from = envelope.From;
        var to = envelope.To;
        var fromProxy = IsControlPlaneService(from, InteropServices.Philhealth);
        var toProxy = IsControlPlaneService(to, InteropServices.Philhealth);
        var fromPortal = from.Kind == PartyKind.ControlPlane && (from.Service ?? InteropServices.Portal) == InteropServices.Portal;
        var toPortal = to.Kind == PartyKind.ControlPlane && (to.Service ?? InteropServices.Portal) == InteropServices.Portal;

        switch (envelope.Type)
        {
            case var t when t == InteropTypes.PhilHealthRequest:
                return from.Kind == PartyKind.Facility && toProxy && (sender.Kind is HubClientKind.CloudService or HubClientKind.EdgeCell)
                    ? null
                    : $"'{t}' must be sent by a facility to the '{InteropServices.Philhealth}' service.";

            case var t when t == InteropTypes.PhilHealthResponse:
                return fromProxy && to.Kind == PartyKind.Facility
                    ? null
                    : $"'{t}' must be sent by the '{InteropServices.Philhealth}' service to a facility.";

            case var t when t == InteropTypes.PhilHealthConfigRequested || t == InteropTypes.PhilHealthConfigUpsertRequested:
                return fromProxy && toPortal
                    ? null
                    : $"'{t}' must be sent by the '{InteropServices.Philhealth}' service to the portal.";

            case var t when t == InteropTypes.PhilHealthConfigResponded || t == InteropTypes.PhilHealthConfigUpsertResponded:
                return fromPortal && toProxy
                    ? null
                    : $"'{t}' must be sent by the portal to the '{InteropServices.Philhealth}' service.";

            default:
                if (toProxy) return $"The '{InteropServices.Philhealth}' service accepts only philhealth.* messages, not '{envelope.Type}'.";
                if (fromProxy) return $"The '{InteropServices.Philhealth}' service may only send philhealth.* messages, not '{envelope.Type}'.";
                return null;
        }
    }

    private static bool IsControlPlaneService(Party party, string service) =>
        party.Kind == PartyKind.ControlPlane && string.Equals(party.Service, service, StringComparison.Ordinal);
}
