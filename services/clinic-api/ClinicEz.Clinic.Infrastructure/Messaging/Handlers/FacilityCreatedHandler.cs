using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Licensing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Provisions (or refreshes) a clinic when the control plane issues its license (<c>facility.license.issued</c>)
/// and confirms back to the portal. Only the control plane may provision a clinic, and only for the facility the
/// message is addressed to. Provisioning is an upsert, so a redelivered message changes nothing.
/// </summary>
public sealed class FacilityCreatedHandler : IInteropHandler<FacilityCreatedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IInteropPublisher _publisher;
    private readonly IFacilityLicenseValidator _licenseValidator;
    private readonly ILogger<FacilityCreatedHandler> _logger;

    public FacilityCreatedHandler(
        ApplicationDbContext dbContext,
        IInteropPublisher publisher,
        IFacilityLicenseValidator licenseValidator,
        ILogger<FacilityCreatedHandler> logger)
    {
        _dbContext = dbContext;
        _publisher = publisher;
        _licenseValidator = licenseValidator;
        _logger = logger;
    }

    public async Task HandleAsync(FacilityCreatedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        if (message.FacilityType != FacilityType.Clinic)
            return;

        if (context.From.Kind != PartyKind.ControlPlane)
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] Ignoring facility license {MessageId} from {From}: only the control plane may provision a clinic.",
                context.MessageId, context.From.Address);
            return;
        }

        var to = context.To;
        if (to.Kind != PartyKind.Facility
            || !Guid.TryParse(to.FacilityId, out var addressedFacilityId)
            || addressedFacilityId != message.ResourceId
            || !string.Equals(to.TenantId, message.TenantId, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] Ignoring facility license {MessageId}: it is addressed to {To}, not to clinic {ResourceId} of tenant {TenantId}.",
                context.MessageId, to.Address, message.ResourceId, message.TenantId);
            return;
        }

        _logger.LogInformation("[ClinicEz.Clinic] Provisioning Clinic: '{Name}' (ID: {ResourceId}) for Tenant {TenantId}",
            message.Name, message.ResourceId, message.TenantId);

        var tenantId = message.TenantId.ToLower();
        var entitlementVersion = _licenseValidator.Validate(message.LicenseToken, message.ResourceId, message.TenantId).Payload?.EntitlementVersion ?? 0;

        // Seed or update ClinicSettings with cryptographically rooted license token
        var existingSettings = await _dbContext.ClinicSettings
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.ClinicId == message.ResourceId && s.TenantId.ToLower() == tenantId, ct);

        if (existingSettings != null)
        {
            if (!string.IsNullOrWhiteSpace(message.LicenseToken))
            {
                existingSettings.LicenseToken = message.LicenseToken;
                existingSettings.PlanTier = message.PlanTier ?? "Community";
                existingSettings.MaxStaffLimit = message.Limits?.MaxStaff ?? 5;
                existingSettings.LicenseExpiresAt = message.LicenseExpiresAt;
                existingSettings.EntitlementVersion = entitlementVersion;
            }
            existingSettings.ClinicName = message.Name;
            existingSettings.TenantSlug = message.TenantSlug ?? existingSettings.TenantSlug;
            existingSettings.FacilitySlug = message.Slug ?? existingSettings.FacilitySlug;
            existingSettings.IsWorkspaceEligible = message.IsWorkspaceEligible ?? false;

            if (message.BranchId != null)
            {
                existingSettings.BranchId = message.BranchId;
                existingSettings.BranchName = message.BranchName;
                existingSettings.BranchPhilHealthAccreditationNumber = message.BranchPhilHealthAccreditationNumber;
                existingSettings.BranchPmccNumber = message.BranchPmccNumber;
                existingSettings.BranchSoftwareCertificateId = message.BranchSoftwareCertificateId;
                existingSettings.BranchKonsultaEndpoint = message.BranchKonsultaEndpoint;
                existingSettings.IsBranchPhilHealthAccredited = message.IsBranchPhilHealthAccredited;

                if (!existingSettings.IsPhilHealthOverridden)
                {
                    if (message.IsBranchPhilHealthAccredited && !string.IsNullOrWhiteSpace(message.BranchPhilHealthAccreditationNumber))
                    {
                        existingSettings.AccreditationNumber = message.BranchPhilHealthAccreditationNumber;
                        existingSettings.PmccNumber = message.BranchPmccNumber;
                        existingSettings.SoftwareCertificateId = message.BranchSoftwareCertificateId;
                        existingSettings.KonsultaEndpoint = !string.IsNullOrWhiteSpace(message.BranchKonsultaEndpoint) ? message.BranchKonsultaEndpoint : "/soap/konsulta";
                        existingSettings.IsPhilHealthConfigured = true;
                    }
                    else
                    {
                        existingSettings.IsPhilHealthConfigured = false;
                    }
                }
            }
            else if (existingSettings.BranchId != null)
            {
                existingSettings.BranchId = null;
                existingSettings.BranchName = null;
                existingSettings.BranchPhilHealthAccreditationNumber = null;
                existingSettings.BranchPmccNumber = null;
                existingSettings.BranchSoftwareCertificateId = null;
                existingSettings.BranchKonsultaEndpoint = null;
                existingSettings.IsBranchPhilHealthAccredited = false;

                if (!existingSettings.IsPhilHealthOverridden)
                {
                    existingSettings.AccreditationNumber = null;
                    existingSettings.PmccNumber = null;
                    existingSettings.SoftwareCertificateId = null;
                    existingSettings.IsPhilHealthConfigured = false;
                }
            }

            if (string.IsNullOrWhiteSpace(existingSettings.LetterheadAddress) && !string.IsNullOrWhiteSpace(message.Address))
                existingSettings.LetterheadAddress = message.Address;
            if (string.IsNullOrWhiteSpace(existingSettings.LetterheadContact) && !string.IsNullOrWhiteSpace(message.ContactNumber))
                existingSettings.LetterheadContact = message.ContactNumber;
        }
        else
        {
            var newSettings = new ClinicSettings
            {
                Id = Guid.NewGuid(),
                TenantId = message.TenantId,
                ClinicId = message.ResourceId,
                TenantSlug = message.TenantSlug,
                FacilitySlug = message.Slug,
                ClinicName = message.Name,
                LicenseToken = message.LicenseToken,
                PlanTier = message.PlanTier ?? "Community",
                MaxStaffLimit = message.Limits?.MaxStaff ?? 5,
                LicenseExpiresAt = message.LicenseExpiresAt,
                EntitlementVersion = entitlementVersion,
                IsWorkspaceEligible = message.IsWorkspaceEligible ?? false,
                BranchId = message.BranchId,
                BranchName = message.BranchName,
                BranchPhilHealthAccreditationNumber = message.BranchPhilHealthAccreditationNumber,
                BranchPmccNumber = message.BranchPmccNumber,
                BranchSoftwareCertificateId = message.BranchSoftwareCertificateId,
                BranchKonsultaEndpoint = message.BranchKonsultaEndpoint,
                IsBranchPhilHealthAccredited = message.IsBranchPhilHealthAccredited,
                IsPhilHealthOverridden = false,
                LetterheadAddress = message.Address,
                LetterheadContact = message.ContactNumber,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "SystemProvisioning"
            };

            if (message.IsBranchPhilHealthAccredited && !string.IsNullOrWhiteSpace(message.BranchPhilHealthAccreditationNumber))
            {
                newSettings.AccreditationNumber = message.BranchPhilHealthAccreditationNumber;
                newSettings.PmccNumber = message.BranchPmccNumber;
                newSettings.SoftwareCertificateId = message.BranchSoftwareCertificateId;
                newSettings.KonsultaEndpoint = !string.IsNullOrWhiteSpace(message.BranchKonsultaEndpoint) ? message.BranchKonsultaEndpoint : "/soap/konsulta";
                newSettings.IsPhilHealthConfigured = true;
            }
            else
            {
                newSettings.IsPhilHealthConfigured = false;
            }

            _dbContext.ClinicSettings.Add(newSettings);
        }

        // Confirm provisioning to the control plane in the same transaction as the settings change.
        _publisher.Enqueue(
            InteropTypes.FacilityProvisioned,
            ClinicParties.Clinic(message.TenantId, message.ResourceId.ToString()),
            Party.Portal,
            context.CorrelationId,
            new FacilityProvisionedEvent
            {
                ResourceId = message.ResourceId,
                TenantId = message.TenantId,
                Success = true,
                Message = $"Clinic dashboard successfully provisioned '{message.Name}'."
            });

        await _dbContext.SaveChangesAsync(ct);
    }
}
