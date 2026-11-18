using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Messaging.Handlers;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Handles <c>facility.directory.updated</c> control-plane messages from Portal.
/// Updates the clinic's Tier-1 workspace discovery eligibility (<c>IsWorkspaceEligible</c>),
/// platform verification status, and synchronizes clinic name, routing slugs, and branch metadata.
/// </summary>
public sealed class FacilityDirectoryUpdatedHandler : IInteropHandler<FacilityCreatedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<FacilityDirectoryUpdatedHandler> _logger;
    private readonly IInteropPublisher? _publisher;

    public FacilityDirectoryUpdatedHandler(
        ApplicationDbContext dbContext,
        ILogger<FacilityDirectoryUpdatedHandler> logger,
        IInteropPublisher? publisher = null)
    {
        _dbContext = dbContext;
        _logger = logger;
        _publisher = publisher;
    }

    public async Task HandleAsync(FacilityCreatedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        // 1. Sender Authentication: Only Portal control-plane may update workspace eligibility or verification status
        if (!DirectoryInteropSyncHelper.IsAuthorizedPortalSender(context, _logger, InteropTypes.FacilityDirectoryUpdated))
        {
            return;
        }

        // 2. Recipient Validation: Must be addressed to this clinic facility
        var to = context.To;
        if (to.Kind != PartyKind.Facility
            || !Guid.TryParse(to.FacilityId, out var addressedFacilityId)
            || addressedFacilityId != message.ResourceId
            || !string.Equals(to.TenantId, message.TenantId, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] Ignoring facility.directory.updated {MessageId}: addressed to {To}, not to clinic {ResourceId} of tenant {TenantId}.",
                context.MessageId, to.Address, message.ResourceId, message.TenantId);
            return;
        }

        if (message.FacilityType != FacilityType.Clinic)
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] Ignoring facility.directory.updated {MessageId}: facility type {Type} is not Clinic.",
                context.MessageId, message.FacilityType);
            return;
        }

        // 3. Multi-Tenant Filter Bypass & Update
        var tenantId = message.TenantId.ToLower();
        var settings = await _dbContext.Settings
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.ClinicId == message.ResourceId && s.TenantId.ToLower() == tenantId, ct);

        if (settings == null)
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] ClinicSettings not found for clinic {ResourceId} of tenant {TenantId} on facility.directory.updated {MessageId}.",
                message.ResourceId, message.TenantId, context.MessageId);
            return;
        }

        settings.IsWorkspaceEligible = message.IsWorkspaceEligible ?? false;

        var previousVerificationStatus = settings.PlatformVerificationStatus;
        if (message.PlatformVerificationStatus.HasValue)
        {
            settings.PlatformVerificationStatus = message.PlatformVerificationStatus.Value;
        }
        else if (message.IsPlatformVerified.HasValue)
        {
            settings.PlatformVerificationStatus = message.IsPlatformVerified.Value
                ? PlatformVerificationStatus.Verified
                : PlatformVerificationStatus.Unverified;
        }

        if (settings.PlatformVerificationStatus == PlatformVerificationStatus.Verified)
        {
            settings.VerificationRejectionReason = null;
        }
        else if (message.VerificationRejectionReason != null)
        {
            settings.VerificationRejectionReason = string.IsNullOrWhiteSpace(message.VerificationRejectionReason)
                ? null
                : message.VerificationRejectionReason.Trim();
        }

        if (!string.IsNullOrWhiteSpace(message.Name))
            settings.ClinicName = message.Name;

        if (!string.IsNullOrWhiteSpace(message.Slug))
            settings.FacilitySlug = message.Slug;

        if (!string.IsNullOrWhiteSpace(message.TenantSlug))
            settings.TenantSlug = message.TenantSlug;

        // Synchronize Branch Baseline Metadata if branch assigned or previously assigned
        if (message.BranchId != null)
        {
            settings.BranchId = message.BranchId;
            settings.BranchName = message.BranchName;
            settings.BranchPhilHealthAccreditationNumber = message.BranchPhilHealthAccreditationNumber;
            settings.BranchPmccNumber = message.BranchPmccNumber;
            settings.BranchSoftwareCertificateId = message.BranchSoftwareCertificateId;
            settings.BranchKonsultaEndpoint = message.BranchKonsultaEndpoint;
            settings.IsBranchPhilHealthAccredited = message.IsBranchPhilHealthAccredited;

            // If not overridden by clinic administrator, inherit branch PhilHealth parameters
            if (!settings.IsPhilHealthOverridden)
            {
                if (message.IsBranchPhilHealthAccredited && !string.IsNullOrWhiteSpace(message.BranchPhilHealthAccreditationNumber))
                {
                    settings.AccreditationNumber = message.BranchPhilHealthAccreditationNumber;
                    settings.PmccNumber = message.BranchPmccNumber;
                    settings.SoftwareCertificateId = message.BranchSoftwareCertificateId;
                    settings.KonsultaEndpoint = !string.IsNullOrWhiteSpace(message.BranchKonsultaEndpoint) ? message.BranchKonsultaEndpoint : "/soap/konsulta";
                    settings.IsPhilHealthConfigured = true;
                }
                else
                {
                    settings.AccreditationNumber = null;
                    settings.PmccNumber = null;
                    settings.SoftwareCertificateId = null;
                    settings.KonsultaEndpoint = "/soap/konsulta";
                    settings.IsPhilHealthConfigured = false;
                }
            }
        }
        else if (settings.BranchId != null)
        {
            // Specifically unlinked from branch: clear branch metadata and reset if not overridden
            settings.BranchId = null;
            settings.BranchName = null;
            settings.BranchPhilHealthAccreditationNumber = null;
            settings.BranchPmccNumber = null;
            settings.BranchSoftwareCertificateId = null;
            settings.BranchKonsultaEndpoint = null;
            settings.IsBranchPhilHealthAccredited = false;

            if (!settings.IsPhilHealthOverridden)
            {
                settings.AccreditationNumber = null;
                settings.PmccNumber = null;
                settings.SoftwareCertificateId = null;
                settings.KonsultaEndpoint = "/soap/konsulta";
                settings.IsPhilHealthConfigured = false;
            }
        }

        settings.UpdatedAt = DateTime.UtcNow;

        if (settings.PlatformVerificationStatus != previousVerificationStatus)
        {
            var (action, outcome, description) = settings.PlatformVerificationStatus switch
            {
                PlatformVerificationStatus.Verified => (
                    "operations.facility_verification.approved",
                    ClinicAuditOutcomes.Success,
                    "Platform approved facility directory verification."),
                PlatformVerificationStatus.Rejected => (
                    "operations.facility_verification.rejected",
                    ClinicAuditOutcomes.Warning,
                    $"Platform rejected facility directory verification: {settings.VerificationRejectionReason}"),
                PlatformVerificationStatus.Suspended => (
                    "operations.facility_verification.suspended",
                    ClinicAuditOutcomes.Warning,
                    $"Platform suspended facility directory verification: {settings.VerificationRejectionReason}"),
                _ => (
                    "operations.facility_verification.updated",
                    ClinicAuditOutcomes.Success,
                    $"Platform updated facility verification status to {settings.PlatformVerificationStatus}.")
            };

            _dbContext.AuditEntries.Add(DirectoryVerificationAuditHelper.CreateEntry(
                settings.TenantId,
                settings.ClinicId,
                ClinicAuditCategories.Operations,
                ClinicAuditSeverities.Urgent,
                action,
                "FacilitySettings",
                settings.ClinicId.ToString(),
                outcome,
                description,
                actorName: "PortalControlPlane",
                actorRole: "ControlPlane",
                metadata: new
                {
                    PreviousStatus = previousVerificationStatus,
                    NewStatus = settings.PlatformVerificationStatus,
                    settings.VerificationRejectionReason,
                    context.MessageId
                }));
        }

        await DirectoryInteropSyncHelper.EnqueueDirectorySnapshotIfVerifiedAndPublishedAsync(
            _dbContext,
            _publisher ?? new InteropPublisher(_dbContext),
            settings,
            ct);

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[ClinicEz.Clinic] Applied facility.directory.updated {MessageId} for clinic {ResourceId} (Tenant: {TenantId}). IsWorkspaceEligible={IsWorkspaceEligible}, PlatformVerificationStatus={PlatformVerificationStatus}",
            context.MessageId, message.ResourceId, message.TenantId, settings.IsWorkspaceEligible, settings.PlatformVerificationStatus);
    }
}
