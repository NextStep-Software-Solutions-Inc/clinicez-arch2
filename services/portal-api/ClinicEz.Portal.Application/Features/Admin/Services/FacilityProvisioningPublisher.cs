using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Admin.Services;

/// <summary>
/// Announces a new or re-activated facility over the hub: its licence and the current workspace profile go to the
/// facility itself (the licence also to the cell's billing service) and a licence-free copy goes to patient-api for the patient-facing facility catalogue.
/// </summary>
public interface IFacilityProvisioningPublisher
{
    /// <summary>
    /// Stages the messages in the transactional outbox (creating the workspace's default settings row when it does
    /// not exist yet). Call it BEFORE the <c>SaveChanges</c> that persists the facility so the facility and its
    /// messages commit atomically.
    /// </summary>
    Task StageProvisionedAsync(Tenant tenant, FacilityCreatedEvent facilityCreated, CancellationToken cancellationToken);

    /// <summary>
    /// Stages a licence-free <c>facility.directory.updated</c> message to <c>patient-api</c> (and to the facility mailbox
    /// for Clinic facilities) whenever a facility's metadata, branch address, PhilHealth accreditation, visibility, or staff roster changes.
    /// </summary>
    Task StageDirectoryUpdateAsync(Tenant tenant, Facility facility, CancellationToken cancellationToken = default);
}

public sealed class FacilityProvisioningPublisher(IApplicationDbContext context, IInteropPublisher publisher)
    : IFacilityProvisioningPublisher
{
    private static readonly HashSet<string> NonClinicalRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "Billing",
        "Cashier",
        "Receptionist",
        "Front Desk",
        "IT Support",
        "Encoder"
    };

    public async Task StageProvisionedAsync(Tenant tenant, FacilityCreatedEvent facilityCreated, CancellationToken cancellationToken)
    {
        // Enrich patient-api catalogue copy with facility/branch metadata and clinical providers (licence stripped).
        var trackedFacility = context.Facilities.Local.FirstOrDefault(f => f.Id == facilityCreated.ResourceId)
            ?? await context.Facilities
                .AsNoTracking()
                .Include(f => f.Branch)
                .FirstOrDefaultAsync(f => f.Id == facilityCreated.ResourceId, cancellationToken);

        Branch? branch = trackedFacility?.Branch;
        if (trackedFacility is not null && branch is null && trackedFacility.BranchId.HasValue)
        {
            branch = context.Branches.Local.FirstOrDefault(b => b.Id == trackedFacility.BranchId.Value)
                ?? await context.Branches.AsNoTracking()
                    .FirstOrDefaultAsync(b => b.Id == trackedFacility.BranchId.Value && !b.IsDeleted, cancellationToken);
        }

        var isBranchAccredited = branch is not null && branch.IsPhilHealthAccredited && !string.IsNullOrWhiteSpace(branch.PhilHealthAccreditationNumber);

        var licensedEvent = facilityCreated with
        {
            BranchId = branch?.Id ?? facilityCreated.BranchId,
            BranchName = branch?.Name ?? facilityCreated.BranchName,
            BranchPhilHealthAccreditationNumber = branch?.PhilHealthAccreditationNumber ?? facilityCreated.BranchPhilHealthAccreditationNumber,
            BranchPmccNumber = branch?.PhilHealthPmccNumber ?? facilityCreated.BranchPmccNumber,
            BranchSoftwareCertificateId = branch?.PhilHealthSoftwareCertificateId ?? facilityCreated.BranchSoftwareCertificateId,
            BranchKonsultaEndpoint = branch?.PhilHealthKonsultaEndpoint ?? facilityCreated.BranchKonsultaEndpoint,
            IsBranchPhilHealthAccredited = isBranchAccredited || facilityCreated.IsBranchPhilHealthAccredited,
            IsPhilHealthAccredited = facilityCreated.IsPhilHealthAccredited ?? isBranchAccredited
        };

        // The correlation id is the facility id, so everything about one facility shares a workflow id.
        var correlationId = licensedEvent.ResourceId;
        var facility = Party.ForFacility(licensedEvent.TenantId, licensedEvent.ResourceId.ToString(), licensedEvent.FacilityType);

        publisher.Enqueue(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            facility,
            correlationId,
            licensedEvent);

        // The cell's billing service is licensed with the facility, so it receives the same license from its own mailbox.
        publisher.Enqueue(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            Party.ForFacility(licensedEvent.TenantId, licensedEvent.ResourceId.ToString(), licensedEvent.FacilityType, InteropServices.Billing),
            correlationId,
            licensedEvent);

        // The cell's comms service is licensed with the facility, so it receives the same license from its own mailbox.
        publisher.Enqueue(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            Party.ForFacility(licensedEvent.TenantId, licensedEvent.ResourceId.ToString(), licensedEvent.FacilityType, InteropServices.Comms),
            correlationId,
            licensedEvent);

        // The new facility starts with the workspace profile instead of having to ask for it.
        var settings = await WorkspaceSettingsStore.GetOrCreateAsync(context, tenant, cancellationToken);
        publisher.Enqueue(
            InteropTypes.WorkspaceProfileUpdated,
            Party.Portal,
            facility,
            correlationId,
            WorkspaceProfileMapper.ToEvent(tenant, settings));

        var directoryEvent = await BuildDirectoryEventAsync(tenant, trackedFacility, licensedEvent, cancellationToken);

        publisher.Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Party.Portal,
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            correlationId,
            directoryEvent);

        var targetFacilityType = trackedFacility?.FacilityType ?? licensedEvent.FacilityType;
        if (targetFacilityType == FacilityType.Clinic)
        {
            publisher.Enqueue(
                InteropTypes.FacilityDirectoryUpdated,
                Party.Portal,
                Party.ForFacility(tenant.Id.ToString(), (trackedFacility?.Id ?? licensedEvent.ResourceId).ToString(), targetFacilityType),
                correlationId,
                directoryEvent);
        }
    }

    public async Task StageDirectoryUpdateAsync(Tenant tenant, Facility facility, CancellationToken cancellationToken = default)
    {
        var baseEvent = new FacilityCreatedEvent
        {
            TenantId = tenant.Id.ToString(),
            TenantSlug = tenant.TenantSlug,
            FacilityType = facility.FacilityType,
            ResourceId = facility.Id,
            Name = facility.Name,
            Slug = facility.Slug
        };

        var directoryEvent = await BuildDirectoryEventAsync(tenant, facility, baseEvent, cancellationToken);

        publisher.Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Party.Portal,
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            facility.Id,
            directoryEvent);

        if (facility.FacilityType == FacilityType.Clinic)
        {
            publisher.Enqueue(
                InteropTypes.FacilityDirectoryUpdated,
                Party.Portal,
                Party.ForFacility(tenant.Id.ToString(), facility.Id.ToString(), facility.FacilityType),
                facility.Id,
                directoryEvent);
        }
    }

    private async Task<FacilityCreatedEvent> BuildDirectoryEventAsync(
        Tenant tenant,
        Facility? facility,
        FacilityCreatedEvent source,
        CancellationToken cancellationToken)
    {
        Branch? branch = facility?.Branch;
        if (facility is not null && branch is null && facility.BranchId.HasValue)
        {
            branch = context.Branches.Local.FirstOrDefault(b => b.Id == facility.BranchId.Value)
                ?? await context.Branches.AsNoTracking()
                    .FirstOrDefaultAsync(b => b.Id == facility.BranchId.Value && !b.IsDeleted, cancellationToken);
        }

        var city = FirstNonEmpty(source.City, facility?.City, branch?.City, tenant.City);
        var province = FirstNonEmpty(source.Province, facility?.Province, branch?.Province, tenant.Province);
        var region = FirstNonEmpty(source.Region, facility?.Region, branch?.Region);
        var street = FirstNonEmpty(facility?.StreetAddress, branch?.StreetAddress, tenant.StreetLine1);
        var barangay = FirstNonEmpty(facility?.Barangay, branch?.Barangay);
        var address = FirstNonEmpty(source.Address, BuildAddress(street, barangay, city, province));
        var contactNumber = FirstNonEmpty(source.ContactNumber, facility?.ContactNumber, branch?.ContactNumber, tenant.PhoneNumber);
        var contactEmail = FirstNonEmpty(source.ContactEmail, facility?.ContactEmail, branch?.ContactEmail, tenant.Email);
        var operatingHours = FirstNonEmpty(source.OperatingHours, facility?.OperatingHours);
        var classification = FirstNonEmpty(source.Classification, facility?.Classification);
        var isBranchAccredited = branch is not null && branch.IsPhilHealthAccredited && !string.IsNullOrWhiteSpace(branch.PhilHealthAccreditationNumber);
        var isPhilHealthAccredited = source.IsPhilHealthAccredited ?? isBranchAccredited;
        var isPublic = source.IsPublic ?? (facility is not null
            && facility.IsPatientDiscoveryEligible
            && !facility.IsDeleted
            && facility.Status != FacilityStatus.Suspended
            && facility.Status != FacilityStatus.Failed);

        IReadOnlyList<FacilityProviderDto>? providers = source.Providers;
        if (providers is null && source.FacilityType == FacilityType.Clinic)
        {
            var staffRows = await context.StaffMembers
                .AsNoTracking()
                .Include(s => s.WorkspaceMember)
                .Where(s => !s.IsDeleted
                            && s.TenantId == tenant.Id
                            && (s.FacilityId == source.ResourceId || s.FacilityId == null)
                            && !s.WorkspaceMember.IsDeleted
                            && s.WorkspaceMember.Status == MemberStatus.Active)
                .OrderBy(s => s.WorkspaceMember.FullName)
                .ToListAsync(cancellationToken);

            var clinicalRows = staffRows
                .Where(s => !NonClinicalRoles.Contains(s.Role) && !string.IsNullOrWhiteSpace(s.WorkspaceMember.FullName))
                .Select((s, index) => new FacilityProviderDto(
                    Id: s.Id,
                    Name: s.WorkspaceMember.FullName,
                    Specialty: string.IsNullOrWhiteSpace(s.Role) || string.Equals(s.Role, "Staff", StringComparison.OrdinalIgnoreCase)
                        ? FirstNonEmpty(classification, "General Practice")!
                        : s.Role,
                    ProfessionalLicenseNo: null,
                    IsActive: true,
                    DisplayOrder: index))
                .ToList();

            if (clinicalRows.Count > 0)
            {
                providers = clinicalRows;
            }
        }

        return source with
        {
            LicenseToken = null,
            Limits = null,
            Address = address,
            City = city,
            Province = province,
            Region = region,
            ContactNumber = contactNumber,
            ContactEmail = contactEmail,
            OperatingHours = operatingHours,
            Classification = classification,
            IsPhilHealthAccredited = isPhilHealthAccredited,
            IsWorkspaceEligible = facility?.IsPatientDiscoveryEligible,
            IsPublic = isPublic,
            Providers = providers,
            BranchId = branch?.Id ?? source.BranchId,
            BranchName = branch?.Name ?? source.BranchName,
            BranchPhilHealthAccreditationNumber = branch?.PhilHealthAccreditationNumber ?? source.BranchPhilHealthAccreditationNumber,
            BranchPmccNumber = branch?.PhilHealthPmccNumber ?? source.BranchPmccNumber,
            BranchSoftwareCertificateId = branch?.PhilHealthSoftwareCertificateId ?? source.BranchSoftwareCertificateId,
            BranchKonsultaEndpoint = branch?.PhilHealthKonsultaEndpoint ?? source.BranchKonsultaEndpoint,
            IsBranchPhilHealthAccredited = isBranchAccredited || source.IsBranchPhilHealthAccredited
        };
    }

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim();

    private static string? BuildAddress(params string?[] parts)
    {
        var nonEmpty = parts
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p!.Trim())
            .ToList();
        return nonEmpty.Count > 0 ? string.Join(", ", nonEmpty) : null;
    }
}
