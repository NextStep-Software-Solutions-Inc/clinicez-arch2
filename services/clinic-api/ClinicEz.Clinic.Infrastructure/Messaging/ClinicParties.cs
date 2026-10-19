using System;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>Builds the interop addresses clinic-api sends from and to.</summary>
internal static class ClinicParties
{
    public static Party Clinic(string tenantId, string facilityId) =>
        Party.ForFacility(tenantId, facilityId, FacilityType.Clinic);

    /// <summary>
    /// The facility a message is routed to. A missing or malformed target is a client error: the caller picked a
    /// destination that cannot receive the message, and nothing is queued.
    /// </summary>
    public static Party Target(string? tenantId, string? facilityId, FacilityType type, string what)
    {
        if (string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(facilityId))
            throw new BadRequestException($"A target {what} (tenant and facility) is required.");

        if (!Guid.TryParse(facilityId, out var facilityGuid))
            throw new BadRequestException($"The target {what} facility id '{facilityId}' is not valid.");

        return Party.ForFacility(tenantId.Trim(), facilityGuid.ToString(), type);
    }
}
