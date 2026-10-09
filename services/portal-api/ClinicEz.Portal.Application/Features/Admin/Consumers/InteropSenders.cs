using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interop;

namespace ClinicEz.Portal.Application.Features.Admin.Consumers;

/// <summary>
/// Who an interop envelope came from. The envelope sender is authoritative: it is set by the hub from the caller's
/// credentials, so payload ids are only trusted when they agree with it.
/// </summary>
internal static class InteropSenders
{
    /// <summary>The sender is a service of this very facility (optionally a specific service, e.g. <c>billing</c>).</summary>
    public static bool IsFacility(Party sender, Guid tenantId, Guid facilityId, string? service = null) =>
        sender.Kind == PartyKind.Facility
        && Guid.TryParse(sender.TenantId, out var senderTenant) && senderTenant == tenantId
        && Guid.TryParse(sender.FacilityId, out var senderFacility) && senderFacility == facilityId
        && (service is null || string.Equals(sender.Service, service, StringComparison.OrdinalIgnoreCase));

    public static bool IsFacility(Party sender, Facility facility, string? service = null) =>
        IsFacility(sender, facility.TenantId, facility.Id, service);
}
