using ClinicEz.Shared.Interop;

namespace ClinicEz.Patient.Application.Features.Documents.Interop;

/// <summary>Sender and recipient checks shared by every handler of a message a facility sends to a patient.</summary>
internal static class DocumentInteropRules
{
    /// <summary>True when the authenticated sender is exactly the facility the payload names.</summary>
    public static bool IsFromFacility(Party from, string? tenantId, string? facilityId) =>
        from.Kind == PartyKind.Facility
        && !string.IsNullOrEmpty(tenantId)
        && !string.IsNullOrEmpty(facilityId)
        && string.Equals(from.TenantId, tenantId, StringComparison.Ordinal)
        && string.Equals(from.FacilityId, facilityId, StringComparison.OrdinalIgnoreCase);

    /// <summary>True when the envelope is addressed to the patient the payload is about.</summary>
    public static bool IsAddressedToPatient(Party to, Guid patientId) =>
        to.Kind == PartyKind.Patient
        && Guid.TryParse(to.PatientId, out var addressed)
        && addressed == patientId;
}
