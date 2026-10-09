using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;

namespace ClinicEz.Portal.Application.Features.Admin.Services;

/// <summary>
/// Announces a new or re-activated facility over the hub: its licence goes to the facility itself and a
/// licence-free copy goes to patient-api for the patient-facing facility catalogue.
/// </summary>
public interface IFacilityProvisioningPublisher
{
    /// <summary>
    /// Stages both messages in the transactional outbox. Call it BEFORE the <c>SaveChanges</c> that persists the
    /// facility so the facility and its messages commit atomically.
    /// </summary>
    void EnqueueLicenseIssued(FacilityCreatedEvent facilityCreated);
}

public sealed class FacilityProvisioningPublisher(IInteropPublisher publisher) : IFacilityProvisioningPublisher
{
    public void EnqueueLicenseIssued(FacilityCreatedEvent facilityCreated)
    {
        // The correlation id is the facility id, so everything about one facility shares a workflow id.
        var correlationId = facilityCreated.ResourceId;

        publisher.Enqueue(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            Party.ForFacility(facilityCreated.TenantId, facilityCreated.ResourceId.ToString(), facilityCreated.FacilityType),
            correlationId,
            facilityCreated);

        // patient-api only needs the catalogue entry; the licence must never leave the facility's own mailbox.
        publisher.Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Party.Portal,
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            correlationId,
            facilityCreated with { LicenseToken = null, Limits = null });
    }
}
