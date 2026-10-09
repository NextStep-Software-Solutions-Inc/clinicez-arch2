using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Services;

/// <summary>
/// Announces a new or re-activated facility over the hub: its licence and the current workspace profile go to the
/// facility itself and a licence-free copy goes to patient-api for the patient-facing facility catalogue.
/// </summary>
public interface IFacilityProvisioningPublisher
{
    /// <summary>
    /// Stages the messages in the transactional outbox (creating the workspace's default settings row when it does
    /// not exist yet). Call it BEFORE the <c>SaveChanges</c> that persists the facility so the facility and its
    /// messages commit atomically.
    /// </summary>
    Task StageProvisionedAsync(Tenant tenant, FacilityCreatedEvent facilityCreated, CancellationToken cancellationToken);
}

public sealed class FacilityProvisioningPublisher(IApplicationDbContext context, IInteropPublisher publisher)
    : IFacilityProvisioningPublisher
{
    public async Task StageProvisionedAsync(Tenant tenant, FacilityCreatedEvent facilityCreated, CancellationToken cancellationToken)
    {
        // The correlation id is the facility id, so everything about one facility shares a workflow id.
        var correlationId = facilityCreated.ResourceId;
        var facility = Party.ForFacility(facilityCreated.TenantId, facilityCreated.ResourceId.ToString(), facilityCreated.FacilityType);

        publisher.Enqueue(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            facility,
            correlationId,
            facilityCreated);

        // The new facility starts with the workspace profile instead of having to ask for it.
        var settings = await WorkspaceSettingsStore.GetOrCreateAsync(context, tenant, cancellationToken);
        publisher.Enqueue(
            InteropTypes.WorkspaceProfileUpdated,
            Party.Portal,
            facility,
            correlationId,
            WorkspaceProfileMapper.ToEvent(tenant, settings));

        // patient-api only needs the catalogue entry; the licence must never leave the facility's own mailbox.
        publisher.Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Party.Portal,
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            correlationId,
            facilityCreated with { LicenseToken = null, Limits = null });
    }
}