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
/// Handles <c>practitioner.identity.updated</c> messages from Portal.
/// Links canonical practitioner identity, verification status, and profile updates onto the clinic's staff record.
/// </summary>
public sealed class PractitionerIdentityUpdatedHandler : IInteropHandler<PractitionerIdentityUpdatedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<PractitionerIdentityUpdatedHandler> _logger;
    private readonly IInteropPublisher? _publisher;

    public PractitionerIdentityUpdatedHandler(
        ApplicationDbContext dbContext,
        ILogger<PractitionerIdentityUpdatedHandler> logger,
        IInteropPublisher? publisher = null)
    {
        _dbContext = dbContext;
        _logger = logger;
        _publisher = publisher;
    }

    public async Task HandleAsync(PractitionerIdentityUpdatedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        if (!DirectoryInteropSyncHelper.IsAuthorizedPortalSender(context, _logger, InteropTypes.PractitionerIdentityUpdated))
        {
            return;
        }

        var settings = await DirectoryInteropSyncHelper.ResolveAddressedClinicSettingsAsync(
            _dbContext,
            context,
            message.FacilityId,
            message.TenantId,
            _logger,
            InteropTypes.PractitionerIdentityUpdated,
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

        var staff = (message.ClinicStaffMemberId.HasValue
                ? clinicians.FirstOrDefault(s => s.Id == message.ClinicStaffMemberId.Value)
                : null)
            ?? clinicians.FirstOrDefault(s => s.CanonicalProviderId == message.PractitionerId
                || (message.MergedIntoPractitionerId.HasValue && s.CanonicalProviderId == message.MergedIntoPractitionerId.Value))
            ?? clinicians.FirstOrDefault(s =>
                string.Equals(PractitionerIdentity.NormalizeProfessionKind(s.Role.ToString()), targetProfession, StringComparison.OrdinalIgnoreCase)
                && string.Equals(PractitionerIdentity.NormalizePrc(s.PrcLicenseNumber), targetPrc, StringComparison.OrdinalIgnoreCase));

        if (staff == null)
        {
            _logger.LogWarning(
                "[ClinicEz.Clinic] No matching clinician found in clinic {ClinicId} for practitioner.identity.updated {MessageId} (PractitionerId={PractitionerId}).",
                settings.ClinicId, context.MessageId, message.PractitionerId);
            return;
        }

        var canonicalId = message.MergedIntoPractitionerId ?? message.PractitionerId;
        if (canonicalId != Guid.Empty && message.VerificationLevel == PractitionerVerificationLevel.Verified)
        {
            staff.CanonicalProviderId = canonicalId;
        }

        staff.PublicVerificationStatus = message.VerificationLevel;

        if (message.VerificationLevel == PractitionerVerificationLevel.Verified)
        {
            staff.PublicVerificationReason = null;
            staff.AffiliatedVerifiedClinicCount = Math.Max(1, staff.AffiliatedVerifiedClinicCount);
        }
        else if (message.VerificationLevel is PractitionerVerificationLevel.AwaitingConfirmation or PractitionerVerificationLevel.PendingVerification)
        {
            staff.PublicVerificationReason = null;
        }

        if (message.PrcExpiryDate.HasValue)
        {
            staff.PrcExpiryDate = message.PrcExpiryDate.Value;
        }

        if (string.IsNullOrWhiteSpace(staff.PrcLicenseNumber) && !string.IsNullOrWhiteSpace(message.DisplayPrcLicenseNo))
        {
            staff.PrcLicenseNumber = message.DisplayPrcLicenseNo.Trim();
        }

        if (string.IsNullOrWhiteSpace(staff.PublicBio) && !string.IsNullOrWhiteSpace(message.PublicBio))
        {
            staff.PublicBio = message.PublicBio.Trim();
        }

        if (string.IsNullOrWhiteSpace(staff.AvatarUrl) && !string.IsNullOrWhiteSpace(message.AvatarUrl))
        {
            staff.AvatarUrl = message.AvatarUrl.Trim();
        }

        if (string.Equals(message.AffiliationStatus, "Withdrawn", StringComparison.OrdinalIgnoreCase))
        {
            staff.IsDirectoryOptIn = false;
            staff.AffiliatedVerifiedClinicCount = 0;
        }

        staff.UpdatedAt = DateTime.UtcNow;

        var action = message.VerificationLevel == PractitionerVerificationLevel.Verified
            ? "security.practitioner_verification.approved"
            : "security.practitioner_identity.updated";

        _dbContext.AuditEntries.Add(DirectoryVerificationAuditHelper.CreateEntry(
            settings.TenantId,
            settings.ClinicId,
            ClinicAuditCategories.Security,
            ClinicAuditSeverities.Routine,
            action,
            "StaffMember",
            staff.Id.ToString(),
            ClinicAuditOutcomes.Success,
            $"Updated practitioner directory verification state to {message.VerificationLevel} for {staff.FirstName} {staff.LastName}.",
            actorName: "PortalControlPlane",
            actorRole: "ControlPlane",
            metadata: new
            {
                StaffId = staff.Id,
                CanonicalProviderId = canonicalId,
                message.VerificationLevel,
                message.AffiliationStatus,
                context.MessageId
            }));

        if (message.VerificationLevel == PractitionerVerificationLevel.Verified
            || string.Equals(message.AffiliationStatus, "Withdrawn", StringComparison.OrdinalIgnoreCase))
        {
            await DirectoryInteropSyncHelper.EnqueueDirectorySnapshotIfVerifiedAndPublishedAsync(
                _dbContext,
                _publisher ?? new InteropPublisher(_dbContext),
                settings,
                ct);
        }

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[ClinicEz.Clinic] Applied practitioner.identity.updated {MessageId} for staff {StaffId} in clinic {ClinicId}: Status={Status}, CanonicalProviderId={CanonicalProviderId}",
            context.MessageId, staff.Id, settings.ClinicId, staff.PublicVerificationStatus, staff.CanonicalProviderId);
    }
}
