using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;

namespace ClinicEz.Shared.Interop;

/// <summary>Who sits at either end of an interop message.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum PartyKind
{
    /// <summary>A clinic, laboratory, pharmacy or organization (or a service acting for it, e.g. billing).</summary>
    Facility,
    /// <summary>A patient (served by patient-api).</summary>
    Patient,
    /// <summary>The control plane (portal-api) or the hub itself.</summary>
    ControlPlane
}

/// <summary>Well-known service mailboxes. A mailbox is <c>{cellId}:{service}</c> on the hub.</summary>
public static class InteropServices
{
    public const string Clinic = "clinic";
    public const string Laboratory = "laboratory";
    public const string Pharmacy = "pharmacy";
    public const string Organization = "organization";
    public const string Billing = "billing";
    public const string Patient = "patient";
    public const string Portal = "portal";
    public const string Hub = "hub";

    /// <summary>Default service that serves a facility type.</summary>
    public static string ForFacilityType(FacilityType type) => type switch
    {
        FacilityType.Clinic => Clinic,
        FacilityType.Laboratory => Laboratory,
        FacilityType.Pharmacy => Pharmacy,
        FacilityType.Organization => Organization,
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown facility type")
    };

    /// <summary>Resolve the service mailbox a party is served by.</summary>
    public static string For(Party party) => party.Service ?? party.Kind switch
    {
        PartyKind.Patient => Patient,
        PartyKind.ControlPlane => Portal,
        PartyKind.Facility when party.FacilityType is { } t => ForFacilityType(t),
        _ => throw new InvalidOperationException(
            $"Cannot resolve a service for {party.Address}: set Party.Service or Party.FacilityType.")
    };
}

/// <summary>
/// An addressable end of a message. Facilities are addressed by <c>(TenantId, FacilityId)</c>;
/// patients by <c>PatientId</c>. <see cref="Service"/> optionally overrides which service mailbox
/// in the facility's cell receives the message (for example <c>billing</c>).
/// </summary>
public sealed record Party
{
    public PartyKind Kind { get; init; }
    public string? TenantId { get; init; }
    public string? FacilityId { get; init; }
    public string? PatientId { get; init; }
    public FacilityType? FacilityType { get; init; }
    public string? Service { get; init; }

    public static Party ForFacility(string tenantId, string facilityId, FacilityType type, string? service = null) =>
        new() { Kind = PartyKind.Facility, TenantId = tenantId, FacilityId = facilityId, FacilityType = type, Service = service };

    public static Party ForPatient(string patientId) =>
        new() { Kind = PartyKind.Patient, PatientId = patientId };

    public static Party Portal { get; } = new() { Kind = PartyKind.ControlPlane, Service = InteropServices.Portal };

    public static Party Hub { get; } = new() { Kind = PartyKind.ControlPlane, Service = InteropServices.Hub };

    /// <summary>Human readable, stable address used in logs and error messages.</summary>
    public string Address => Kind switch
    {
        PartyKind.Facility => $"facility:{TenantId}/{FacilityId}{(Service is null ? "" : "#" + Service)}",
        PartyKind.Patient => $"patient:{PatientId}",
        _ => $"control:{Service ?? InteropServices.Portal}"
    };
}
