using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.DirectoryVerification;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Services;

public interface IPrcExpirySweeperJob
{
    Task<int> SweepExpiredPrcLicensesAsync(CancellationToken cancellationToken = default);
}

/// <summary>
/// Daily Hangfire job that revokes practitioners whose PRC license expiration date has passed
/// and broadcasts <c>practitioner.verification.revoked</c> to <c>patient-api</c> and all affiliated clinics.
/// </summary>
public sealed class PrcExpirySweeperJob(
    IApplicationDbContext dbContext,
    IInteropPublisher interopPublisher,
    TimeProvider timeProvider,
    ILogger<PrcExpirySweeperJob> logger) : IPrcExpirySweeperJob
{
    public async Task<int> SweepExpiredPrcLicensesAsync(CancellationToken cancellationToken = default)
    {
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var today = DateOnly.FromDateTime(now);

        var expiredPractitioners = await dbContext.Practitioners
            .Include(p => p.Affiliations)
                .ThenInclude(a => a.Facility)
            .Where(p => !p.IsDeleted
                        && p.MergedIntoPractitionerId == null
                        && p.VerificationStatus == PractitionerVerificationLevel.Verified
                        && p.PrcExpiryDate != null
                        && p.PrcExpiryDate.Value < today)
            .OrderBy(p => p.PrcExpiryDate)
            .ToListAsync(cancellationToken);

        if (expiredPractitioners.Count == 0)
            return 0;

        foreach (var practitioner in expiredPractitioners)
        {
            practitioner.VerificationStatus = PractitionerVerificationLevel.Expired;
            practitioner.UpdatedAt = now;

            var activeAffiliations = practitioner.Affiliations
                .Where(a => !a.IsDeleted && a.AffiliationStatus is "Active" or "AwaitingConfirmation")
                .ToList();

            foreach (var affiliation in activeAffiliations)
            {
                affiliation.AffiliationStatus = "Expired";
                affiliation.UpdatedAt = now;
            }

            var reason = $"PRC license expired on {practitioner.PrcExpiryDate:yyyy-MM-dd}.";

            DirectoryVerificationHelper.StagePractitionerRevokedForAll(
                interopPublisher,
                practitioner,
                activeAffiliations.Select(a => (a, (Facility?)a.Facility)),
                PractitionerVerificationLevel.Expired,
                reason,
                now,
                practitioner.Id);

            foreach (var tenantId in activeAffiliations.Select(a => a.TenantId).Distinct())
            {
                DirectoryVerificationHelper.StageAuditEntry(
                    dbContext,
                    tenantId,
                    "system:prc-expiry-sweeper",
                    "PRC Expiry Sweeper",
                    "System",
                    "practitioner-expired",
                    new
                    {
                        practitionerId = practitioner.Id,
                        professionKind = practitioner.ProfessionKind,
                        normalizedPrcLicenseNo = practitioner.NormalizedPrcLicenseNo,
                        prcExpiryDate = practitioner.PrcExpiryDate,
                        reason
                    });
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation("[PrcExpirySweeper] Marked {Count} practitioner(s) Expired and staged Hub revocations.",
            expiredPractitioners.Count);

        return expiredPractitioners.Count;
    }
}
