using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging.Handlers;

/// <summary>
/// Handles <c>practitioner.verification.revoked</c> messages from Portal.
/// Applies revocation, expiration, rejection, or suspension to matching clinician staff records.
/// </summary>
public sealed class PractitionerVerificationRevokedHandler : IInteropHandler<PractitionerVerificationRevokedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<PractitionerVerificationRevokedHandler> _logger;
    private readonly IInteropPublisher? _publisher;

    public PractitionerVerificationRevokedHandler(
        ApplicationDbContext dbContext,
        ILogger<PractitionerVerificationRevokedHandler> logger,
        IInteropPublisher? publisher = null)
    {
        _dbContext = dbContext;
        _logger = logger;
        _publisher = publisher;
    }

    public async Task HandleAsync(PractitionerVerificationRevokedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        if (!DirectoryInteropSyncHelper.IsAuthorizedPortalSender(context, _logger, InteropTypes.PractitionerVerificationRevoked))
        {
            return;
        }

        var settings = await DirectoryInteropSyncHelper.ResolveAddressedClinicSettingsAsync(
            _dbContext,
            context,
            message.FacilityId,
            message.TenantId,
            _logger,
            InteropTypes.PractitionerVerificationRevoked,
            ct);

        if (settings == null)
        {
            return;
        }

        var clinicians = await _dbContext.StaffMembers
            .IgnoreQueryFilters()
            .Where(s => !s.IsDeleted
                        && s.ClinicId == settings.ClinicId
                        && (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse))
            .ToListAsync(ct);

        var targetProfession = PractitionerIdentity.NormalizeProfessionKind(message.ProfessionKind);
        var targetPrc = PractitionerIdentity.NormalizePrc(message.NormalizedPrcLicenseNo);

        var matched = clinicians.Where(s =>
                (message.ClinicStaffMemberId.HasValue && s.Id == message.ClinicStaffMemberId.Value)
                || (message.PractitionerId.HasValue && s.CanonicalProviderId == message.PractitionerId.Value)
                || (!string.IsNullOrWhiteSpace(targetPrc)
                    && string.Equals(PractitionerIdentity.NormalizeProfessionKind(s.Role.ToString()), targetProfession, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(PractitionerIdentity.NormalizePrc(s.PrcLicenseNumber), targetPrc, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        if (matched.Count == 0)
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] No matching clinician found in clinic {ClinicId} for practitioner.verification.revoked {MessageId}.",
                settings.ClinicId, context.MessageId);
            return;
        }

        var reason = string.IsNullOrWhiteSpace(message.Reason) ? null : message.Reason.Trim();
        foreach (var staff in matched)
        {
            staff.PublicVerificationStatus = message.NewStatus;
            staff.PublicVerificationReason = reason;
            if (message.NewStatus is PractitionerVerificationLevel.Suspended or PractitionerVerificationLevel.Expired or PractitionerVerificationLevel.Rejected)
            {
                staff.AffiliatedVerifiedClinicCount = 0;
            }
            staff.UpdatedAt = DateTime.UtcNow;

            _dbContext.AuditEntries.Add(DirectoryVerificationAuditHelper.CreateEntry(
                settings.TenantId,
                settings.ClinicId,
                ClinicAuditCategories.Security,
                ClinicAuditSeverities.Urgent,
                "security.practitioner_verification.revoked",
                "StaffMember",
                staff.Id.ToString(),
                ClinicAuditOutcomes.Warning,
                $"Practitioner directory verification updated to {message.NewStatus}: {reason}",
                actorName: "PortalControlPlane",
                actorRole: "ControlPlane",
                metadata: new
                {
                    StaffId = staff.Id,
                    message.PractitionerId,
                    message.NewStatus,
                    Reason = reason,
                    message.RevokedAtUtc,
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
            "[ClinicEz.Clinic] Applied practitioner.verification.revoked {MessageId} to {Count} clinician(s) in clinic {ClinicId}: Status={Status}",
            context.MessageId, matched.Count, settings.ClinicId, message.NewStatus);
    }
}
