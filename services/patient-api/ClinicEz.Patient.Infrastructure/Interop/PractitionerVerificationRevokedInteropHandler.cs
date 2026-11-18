using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Handles <c>practitioner.verification.revoked</c> from <see cref="Party.Portal"/>:
/// updates the practitioner's <see cref="Practitioner.VerificationLevel"/> and marks targeted
/// or all clinic affiliations as <c>Suspended</c>/<c>Revoked</c>.
/// </summary>
public sealed class PractitionerVerificationRevokedInteropHandler : IInteropHandler<PractitionerVerificationRevokedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<PractitionerVerificationRevokedInteropHandler> _logger;

    public PractitionerVerificationRevokedInteropHandler(
        ApplicationDbContext dbContext,
        ILogger<PractitionerVerificationRevokedInteropHandler> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task HandleAsync(
        PractitionerVerificationRevokedPayload message,
        InteropMessageContext context,
        CancellationToken ct)
    {
        var isAuthorizedPortal = context.From.Kind == PartyKind.ControlPlane &&
                                 string.Equals(InteropServices.For(context.From), InteropServices.Portal, StringComparison.OrdinalIgnoreCase);

        if (!isAuthorizedPortal)
        {
            _logger.LogWarning(
                "Ignoring practitioner.verification.revoked {MessageId}: sender {Sender} is not the portal.",
                context.MessageId, context.From.Address);
            return;
        }

        var utcNow = DateTime.UtcNow;
        var professionKind = PractitionerIdentity.NormalizeProfessionKind(message.ProfessionKind);
        var normalizedPrc = PractitionerIdentity.NormalizePrc(message.NormalizedPrcLicenseNo);
        if (string.IsNullOrWhiteSpace(normalizedPrc) && !string.IsNullOrWhiteSpace(message.NormalizedPrcLicenseNo))
            normalizedPrc = message.NormalizedPrcLicenseNo.Trim().ToUpperInvariant();

        Practitioner? practitioner = null;
        if (message.PractitionerId is { } pid && pid != Guid.Empty)
        {
            practitioner = await _dbContext.Practitioners.FirstOrDefaultAsync(p => p.Id == pid, ct);
            if (practitioner?.MergedIntoPractitionerId is { } mergedTargetId && mergedTargetId != Guid.Empty)
            {
                practitioner.VerificationLevel = message.NewStatus;
                practitioner.UpdatedAt = utcNow;
                practitioner = await _dbContext.Practitioners.FirstOrDefaultAsync(p => p.Id == mergedTargetId, ct) ?? practitioner;
            }
        }

        if (practitioner is null && !string.IsNullOrWhiteSpace(normalizedPrc))
        {
            practitioner = await _dbContext.Practitioners.FirstOrDefaultAsync(
                p => p.NormalizedPrcLicenseNo == normalizedPrc &&
                     p.MergedIntoPractitionerId == null &&
                     (professionKind == null || p.ProfessionKind == professionKind),
                ct);
        }

        if (practitioner is not null)
        {
            practitioner.VerificationLevel = message.NewStatus;
            practitioner.UpdatedAt = utcNow;
        }

        var targetIds = new HashSet<Guid>();
        if (message.PractitionerId is { } msgPid && msgPid != Guid.Empty)
            targetIds.Add(msgPid);
        if (practitioner is not null)
            targetIds.Add(practitioner.Id);

        var affiliationStatus = message.NewStatus == PractitionerVerificationLevel.Suspended
            ? "Suspended"
            : "Revoked";

        List<ClinicHealthcareProvider> targetedProviders;
        if (message.ClinicStaffMemberId is { } staffId && staffId != Guid.Empty)
        {
            targetedProviders = await _dbContext.ClinicHealthcareProviders
                .Where(p => p.Id == staffId && (!message.FacilityId.HasValue || p.ClinicId == message.FacilityId.Value))
                .ToListAsync(ct);
        }
        else if (message.FacilityId is { } facilityId && facilityId != Guid.Empty)
        {
            targetedProviders = await _dbContext.ClinicHealthcareProviders
                .Where(p => p.ClinicId == facilityId &&
                            ((p.PractitionerId != null && targetIds.Contains(p.PractitionerId.Value)) ||
                             (!string.IsNullOrWhiteSpace(normalizedPrc) && p.NormalizedLicenseNo == normalizedPrc)))
                .ToListAsync(ct);
        }
        else
        {
            targetedProviders = await _dbContext.ClinicHealthcareProviders
                .Where(p => (p.PractitionerId != null && targetIds.Contains(p.PractitionerId.Value)) ||
                            (!string.IsNullOrWhiteSpace(normalizedPrc) &&
                             p.NormalizedLicenseNo == normalizedPrc &&
                             (professionKind == null || p.Role == professionKind)))
                .ToListAsync(ct);
        }

        foreach (var provider in targetedProviders)
        {
            provider.AffiliationStatus = affiliationStatus;
            provider.UpdatedAt = utcNow;
        }

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[ClinicEz.Patient] Applied verification revocation ({Status}) for practitioner {PractitionerId}: {Count} affiliation(s) marked {AffiliationStatus}.",
            message.NewStatus, practitioner?.Id ?? message.PractitionerId, targetedProviders.Count, affiliationStatus);
    }
}
