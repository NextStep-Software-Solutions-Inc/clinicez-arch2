using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Integrations;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

/// <summary>
/// Creates a facility. The licence tier is never supplied by the caller: it follows the workspace's own
/// subscription plan. On-premise facilities (<see cref="DeploymentMode"/>) need an https
/// <see cref="ConsoleBaseUrl"/> and are onboarded to the hub as part of creation.
/// </summary>
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
    Guid? BranchId = null,
    string? Slug = null,
    FacilityDeploymentMode DeploymentMode = FacilityDeploymentMode.SharedCloud,
    string? ConsoleBaseUrl = null
) : IRequest<CreateFacilityResult>;

/// <summary>
/// Outcome of <see cref="CreateFacilityCommand"/>. <see cref="HubCredentials"/> are returned once, only for an
/// on-premise facility; <see cref="HubOnboardingPending"/> means the facility exists but the hub could not be
/// reached, so the owner must request credentials again from the facility's hub-credentials endpoint.
/// </summary>
public record CreateFacilityResult(
    bool Success,
    HubEdgeCredentials? HubCredentials = null,
    bool HubOnboardingPending = false);

public class CreateFacilityCommandHandler(
    IApplicationDbContext context,
    IEntitlementGuard entitlementGuard,
    IEntitlementService entitlementService,
    IFacilityAllocationService allocations,
    ILicenseIssuer licenseIssuer,
    IFacilityProvisioningPublisher provisioningPublisher,
    IWebhookDispatcher webhookDispatcher,
    IHubOnboardingService hubOnboarding,
    IConfiguration configuration,
    ILogger<CreateFacilityCommandHandler> logger
) : IRequestHandler<CreateFacilityCommand, CreateFacilityResult>
{
    /// <summary>A facility joins only a branch of its own workspace, and a branch holds at most one facility of each type.</summary>
    private async Task ValidateBranchAsync(Guid tenantId, Guid? branchId, FacilityType facilityType, CancellationToken cancellationToken)
    {
        if (branchId is not { } branch) return;

        var branchBelongs = await context.Branches.AnyAsync(b => b.Id == branch && b.TenantId == tenantId, cancellationToken);
        if (!branchBelongs)
        {
            throw new InvalidOperationException("The selected branch does not belong to this workspace.");
        }

        var typeTaken = await context.Facilities.AnyAsync(f => f.BranchId == branch && f.FacilityType == facilityType, cancellationToken);
        if (typeTaken)
        {
            throw new CodedConflictException(
                ConflictCodes.BranchFacilityTypeTaken,
                $"This branch already has a {facilityType.ToString().ToLowerInvariant()}.");
        }
    }

    public async Task<CreateFacilityResult> Handle(CreateFacilityCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.TenantId) || string.IsNullOrEmpty(request.Name)) return new CreateFacilityResult(false);

        var tenant = await context.Tenants.FirstOrDefaultAsync(t =>
            t.Id.ToString() == request.TenantId || t.TenantSlug == request.TenantId,
            cancellationToken);

        if (tenant == null) return new CreateFacilityResult(false);

        var trimmedName = request.Name.Trim();
        var nameExists = await context.Facilities.AnyAsync(f =>
            f.TenantId == tenant.Id && !f.IsDeleted && f.Name.ToLower() == trimmedName.ToLower(),
            cancellationToken);

        if (nameExists)
        {
            throw new InvalidOperationException($"A facility named '{trimmedName}' already exists in this workspace.");
        }

        var candidateSlug = !string.IsNullOrWhiteSpace(request.Slug)
            ? GetFacilitiesQueryHandler.GenerateFacilitySlug(request.Slug)
            : GetFacilitiesQueryHandler.GenerateFacilitySlug(trimmedName);

        if (candidateSlug.Length < 2 || candidateSlug.Length > 63)
        {
            throw new InvalidOperationException("Facility slug must be between 2 and 63 characters.");
        }

        var slugExists = await context.Facilities.AnyAsync(f =>
            !f.IsDeleted && f.Slug.ToLower() == candidateSlug.ToLower(),
            cancellationToken);

        if (slugExists)
        {
            throw new InvalidOperationException($"The facility slug '{candidateSlug}' is already taken. Please choose another unique subdomain slug.");
        }

        await ValidateBranchAsync(tenant.Id, request.BranchId, request.FacilityType, cancellationToken);

        // Verify workspace plan allocations and limits before provisioning
        await entitlementGuard.EnsureCanCreateFacilityAsync(tenant.Id, request.FacilityType, cancellationToken);
        if (request.DeploymentMode == FacilityDeploymentMode.OnPremise)
        {
            await entitlementGuard.EnsureFeatureAsync(tenant.Id, EntitlementKeys.FeatureOnPrem, cancellationToken);
        }

        // Provision resource ID
        var resourceId = Guid.NewGuid();
        var onPremise = request.DeploymentMode == FacilityDeploymentMode.OnPremise;

        // Create tracking record
        var facility = new Facility
        {
            Id = resourceId,
            TenantId = tenant.Id,
            BranchId = request.BranchId,
            Name = trimmedName,
            Slug = candidateSlug,
            FacilityType = request.FacilityType,
            Status = FacilityStatus.Provisioning,
            DeploymentMode = request.DeploymentMode,
            ConsoleBaseUrl = onPremise ? ConsoleBaseUrlRule.Normalize(request.ConsoleBaseUrl!) : null,
            Classification = request.Classification,
            LicenseToOperate = request.LicenseToOperate,
            PhilHealthAccreditationNumber = request.PhilHealthAccreditationNumber,
            TaxIdentificationNumber = request.TaxIdentificationNumber,
            OperatingHours = string.IsNullOrWhiteSpace(request.OperatingHours) ? null : request.OperatingHours.Trim(),
            Region = request.Region,
            Province = request.Province,
            City = request.City,
            Barangay = request.Barangay,
            ZipCode = request.ZipCode,
            StreetAddress = request.StreetAddress,
            ContactNumber = request.ContactNumber,
            ContactEmail = request.ContactEmail
        };

        // The license is derived from the workspace's entitlements and this facility's share of the pool, never from the request.
        var snapshot = await entitlementService.ResolveAsync(tenant.Id, cancellationToken);
        var shares = await allocations.ComputeSharesAsync(tenant.Id, snapshot, resourceId, cancellationToken);
        var license = licenseIssuer.Issue(tenant, facility, snapshot, shares[resourceId]);
        var limits = license.Payload.Limits;
        var licenseExpiresAt = license.Payload.ExpiresAtUtc!.Value;
        var planTier = snapshot.PlanSlug;

        facility.LicenseToken = license.Token;
        facility.PlanTier = planTier;
        facility.MaxStaffLimit = limits.MaxStaff;
        facility.LicenseExpiresAt = licenseExpiresAt;
        context.Facilities.Add(facility);

        // Increment telemetry counts
        tenant.FacilitiesCount += 1;

        var consoleUrl = GetFacilitiesQueryHandler.ResolveConsoleUrl(configuration, request.FacilityType, FacilityStatus.Active, resourceId, candidateSlug, tenant.TenantSlug, facility.ConsoleBaseUrl);

        // Staged in the outbox before SaveChanges so the facility and its licence messages commit atomically.
        provisioningPublisher.EnqueueLicenseIssued(new FacilityCreatedEvent
        {
            TenantId = tenant.Id.ToString(),
            TenantSlug = tenant.TenantSlug,
            FacilityType = request.FacilityType,
            ResourceId = resourceId,
            Name = trimmedName,
            Slug = candidateSlug,
            LicenseToken = license.Token,
            Limits = limits,
            PlanTier = planTier,
            LicenseExpiresAt = licenseExpiresAt,
            ConsoleUrl = consoleUrl
        });

        // Customers' webhook endpoints learn about the facility, never about its licence.
        await webhookDispatcher.StageAsync(
            tenant.Id,
            tenant.TenantSlug,
            IntegrationCatalog.EventFacilityCreated,
            new
            {
                facilityId = resourceId,
                name = trimmedName,
                slug = candidateSlug,
                facilityType = request.FacilityType.ToString(),
                planTier
            },
            cancellationToken);

        await context.SaveChangesAsync(cancellationToken);

        if (!onPremise) return new CreateFacilityResult(true);

        try
        {
            var credentials = await hubOnboarding.OnboardAsync(facility, tenant, cancellationToken);
            return new CreateFacilityResult(true, credentials);
        }
        catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException or TaskCanceledException)
        {
            // The facility is already committed. Credentials can be requested again, so don't fail the creation.
            logger.LogWarning(ex, "Hub onboarding of facility {FacilityId} is pending: {Reason}", facility.Id, ex.Message);
            return new CreateFacilityResult(true, HubOnboardingPending: true);
        }
    }
}
