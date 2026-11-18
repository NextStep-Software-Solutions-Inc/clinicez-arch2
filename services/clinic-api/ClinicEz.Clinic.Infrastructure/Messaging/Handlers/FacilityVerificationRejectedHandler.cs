using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging.Handlers;

/// <summary>
/// Handles <c>facility.verification.rejected</c> messages from Portal.
/// Records rejection/suspension status and reason on <see cref="FacilitySettings"/> and appends an audit entry.
/// </summary>
public sealed class FacilityVerificationRejectedHandler : IInteropHandler<FacilityVerificationRejectedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<FacilityVerificationRejectedHandler> _logger;

    public FacilityVerificationRejectedHandler(
        ApplicationDbContext dbContext,
        ILogger<FacilityVerificationRejectedHandler> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task HandleAsync(FacilityVerificationRejectedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        if (!DirectoryInteropSyncHelper.IsAuthorizedPortalSender(context, _logger, InteropTypes.FacilityVerificationRejected))
        {
            return;
        }

        var settings = await DirectoryInteropSyncHelper.ResolveAddressedClinicSettingsAsync(
            _dbContext,
            context,
            message.FacilityId,
            message.TenantId,
            _logger,
            InteropTypes.FacilityVerificationRejected,
            ct);

        if (settings == null)
        {
            return;
        }

        var newStatus = string.Equals(message.Status?.Trim(), "Suspended", StringComparison.OrdinalIgnoreCase)
            ? PlatformVerificationStatus.Suspended
            : PlatformVerificationStatus.Rejected;

        settings.PlatformVerificationStatus = newStatus;
        settings.VerificationRejectionReason = string.IsNullOrWhiteSpace(message.Reason) ? null : message.Reason.Trim();
        settings.IsDirectoryPublished = false;
        settings.UpdatedAt = DateTime.UtcNow;

        _dbContext.AuditEntries.Add(DirectoryVerificationAuditHelper.CreateEntry(
            settings.TenantId,
            settings.ClinicId,
            ClinicAuditCategories.Operations,
            ClinicAuditSeverities.Urgent,
            newStatus == PlatformVerificationStatus.Suspended
                ? "operations.facility_verification.suspended"
                : "operations.facility_verification.rejected",
            "FacilitySettings",
            settings.ClinicId.ToString(),
            ClinicAuditOutcomes.Warning,
            $"Facility directory verification {newStatus.ToString().ToLowerInvariant()}: {settings.VerificationRejectionReason}",
            actorName: string.IsNullOrWhiteSpace(message.ReviewedByAdminUserId) ? "PortalControlPlane" : message.ReviewedByAdminUserId,
            actorRole: "ControlPlane",
            metadata: new
            {
                message.RequestId,
                Status = newStatus,
                Reason = settings.VerificationRejectionReason,
                message.ReviewedAtUtc,
                context.MessageId
            }));

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[ClinicEz.Clinic] Applied facility.verification.rejected {MessageId} for clinic {ClinicId}: Status={Status}",
            context.MessageId, settings.ClinicId, newStatus);
    }
}
