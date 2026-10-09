using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;

namespace ClinicEz.Laboratory.Application.Interop;

/// <summary>
/// Builds the interop addresses the laboratory uses. Replies are addressed to the ordering clinic by
/// <c>(tenant, facility)</c> recorded when the order arrived, never by per-facility accession or order numbers.
/// </summary>
public static class LabInteropParties
{
    /// <summary>This laboratory as a sender. Throws when the tenant or laboratory id is unknown.</summary>
    public static Party Laboratory(string? tenantId, string? laboratoryId)
    {
        if (string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(laboratoryId))
        {
            throw new InvalidOperationException("The laboratory tenant and facility id are required to send an interop message.");
        }

        return Party.ForFacility(tenantId, laboratoryId, FacilityType.Laboratory);
    }

    /// <summary>The clinic that ordered a test. Throws when the order carries no ordering party (nobody to reply to).</summary>
    public static Party OrderingClinic(string? orderingTenantId, string? orderingFacilityId)
    {
        if (string.IsNullOrWhiteSpace(orderingTenantId) || string.IsNullOrWhiteSpace(orderingFacilityId))
        {
            throw new InvalidOperationException(
                "The requisition has no ordering clinic (tenant and facility), so the result cannot be addressed to anyone.");
        }

        return Party.ForFacility(orderingTenantId, orderingFacilityId, FacilityType.Clinic);
    }
}
