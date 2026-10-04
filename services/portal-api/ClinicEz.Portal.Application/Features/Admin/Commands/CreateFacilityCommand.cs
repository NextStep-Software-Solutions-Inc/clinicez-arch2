using ClinicEz.Portal.Domain.Entities;
using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

using ClinicEz.Shared.Licensing;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record CreateFacilityCommand(
    string TenantId,
    FacilityType FacilityType,
    string Name,
    string? Classification = null,
    string? LicenseToOperate = null,
    string? PhilHealthAccreditationNumber = null,
    string? TaxIdentificationNumber = null,
    string? OperatingHours = null,
    string? Region = null,
    string? Province = null,
    string? City = null,
    string? Barangay = null,
    string? ZipCode = null,
    string? StreetAddress = null,
    string? ContactNumber = null,
    string? ContactEmail = null,
    string? PlanTier = null,
    Guid? BranchId = null
) : IRequest<bool>;

public class CreateFacilityCommandHandler(
    IApplicationDbContext context,
    IPublishEndpoint publishEndpoint,
    ITenantFeatureGuard tenantFeatureGuard,
    IFacilityLicenseSigner licenseSigner
) : IRequestHandler<CreateFacilityCommand, bool>
{
    public async Task<bool> Handle(CreateFacilityCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.TenantId) || string.IsNullOrEmpty(request.Name)) return false;

        var tenant = await context.Tenants.FirstOrDefaultAsync(t => 
            t.Id.ToString() == request.TenantId || t.TenantSlug == request.TenantId, 
            cancellationToken);

        if (tenant == null) return false;

        // Verify workspace plan allocations and limits before provisioning
        await tenantFeatureGuard.EnsureCanCreateFacilityAsync(tenant.Id.ToString(), request.FacilityType, cancellationToken);

        // Provision resource ID
        var resourceId = Guid.NewGuid();

        // Determine plan tier and cryptographic limits
        var planTier = !string.IsNullOrWhiteSpace(request.PlanTier) ? request.PlanTier : "Community";
        var limits = PlanTierDefaults.GetLimitsForTier(planTier);
        var features = PlanTierDefaults.GetFeaturesForTier(planTier);
        var licenseExpiresAt = DateTime.UtcNow.AddYears(1);

        // Mint cryptographically signed license payload
        var licensePayload = new FacilityLicensePayload
        {
            FacilityId = resourceId,
            TenantId = tenant.Id.ToString(),
            FacilityName = request.Name,
            FacilityType = request.FacilityType.ToString(),
            PlanTier = planTier,
            Limits = limits,
            EnabledFeatures = features,
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = licenseExpiresAt
        };

        var licenseToken = licenseSigner.SignLicense(licensePayload);

        // Create tracking record
        var facility = new Facility
        {
            Id = resourceId,
            TenantId = tenant.Id,
            BranchId = request.BranchId,
            Name = request.Name,
            FacilityType = request.FacilityType,
            Status = FacilityStatus.Provisioning,
            LicenseToken = licenseToken,
            PlanTier = planTier,
            MaxStaffLimit = limits.MaxStaff,
            LicenseExpiresAt = licenseExpiresAt,
            Classification = request.Classification,
            LicenseToOperate = request.LicenseToOperate,
            PhilHealthAccreditationNumber = request.PhilHealthAccreditationNumber,
            TaxIdentificationNumber = request.TaxIdentificationNumber,
            OperatingHours = string.IsNullOrWhiteSpace(request.OperatingHours) ? "Mon-Sat 8:00 AM - 5:00 PM" : request.OperatingHours,
            Region = request.Region,
            Province = request.Province,
            City = request.City,
            Barangay = request.Barangay,
            ZipCode = request.ZipCode,
            StreetAddress = request.StreetAddress,
            ContactNumber = request.ContactNumber,
            ContactEmail = request.ContactEmail,
            LetterheadHeader = request.Name.ToUpper(),
            LetterheadAddress = string.Join(", ", new[] { request.StreetAddress, request.Barangay, request.City, request.Province }.Where(s => !string.IsNullOrWhiteSpace(s))),
            LetterheadContact = request.ContactNumber
        };
        context.Facilities.Add(facility);

        // Increment telemetry counts
        tenant.FacilitiesCount += 1;

        // Publish the event using MassTransit (which automatically registers in the Outbox transaction)
        await publishEndpoint.Publish(new FacilityCreatedEvent
        {
            TenantId = tenant.Id.ToString(),
            FacilityType = request.FacilityType,
            ResourceId = resourceId,
            Name = request.Name,
            LicenseToken = licenseToken,
            Limits = limits,
            PlanTier = planTier,
            LicenseExpiresAt = licenseExpiresAt
        }, cancellationToken);

        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
