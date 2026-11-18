using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.DirectoryVerification;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Messaging.Handlers;

/// <summary>
/// Handles <c>facility.verification.withdrawn</c> (<c>InteropTypes.FacilityVerificationWithdrawn</c>).
/// Marks pending requests withdrawn without deleting audit rows and resets unverified facilities to Unverified.
/// </summary>
public sealed class FacilityVerificationWithdrawnHandler(
    IApplicationDbContext dbContext,
    TimeProvider timeProvider,
    ILogger<FacilityVerificationWithdrawnHandler> logger) : IInteropHandler<FacilityVerificationWithdrawnPayload>
{
    public async Task HandleAsync(FacilityVerificationWithdrawnPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        var sender = context.From;
        if (sender.Kind != PartyKind.Facility
            || !Guid.TryParse(sender.TenantId, out var senderTenantId)
            || !Guid.TryParse(sender.FacilityId, out var senderFacilityId)
            || !Guid.TryParse(payload.TenantId, out var payloadTenantId)
            || senderTenantId != payloadTenantId
            || senderFacilityId != payload.FacilityId)
        {
            logger.LogWarning("Ignoring facility.verification.withdrawn from {Sender}: sender does not match facility {FacilityId} / tenant {TenantId}.",
                sender.Address, payload.FacilityId, payload.TenantId);
            return;
        }

        var facility = await dbContext.Facilities
            .FirstOrDefaultAsync(f => f.Id == payload.FacilityId && f.TenantId == payloadTenantId && !f.IsDeleted, ct);
        if (facility is null)
        {
            logger.LogWarning("Ignoring facility.verification.withdrawn for unknown facility {FacilityId}.", payload.FacilityId);
            return;
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var withdrawnAt = payload.WithdrawnAtUtc == default ? now : payload.WithdrawnAtUtc;

        var pendingRequests = await dbContext.FacilityVerificationRequests
            .Where(r => r.FacilityId == facility.Id && !r.IsDeleted && r.Status == "PendingReview")
            .ToListAsync(ct);

        foreach (var req in pendingRequests)
        {
            req.Status = "Withdrawn";
            req.WithdrawnAtUtc = withdrawnAt;
            req.WithdrawnByActor = payload.WithdrawnByActor;
            req.WithdrawalReason = payload.Reason;
            req.UpdatedAt = now;
        }

        var pendingPractitioners = await dbContext.PractitionerVerificationRequests
            .Include(p => p.Affiliation)
            .Where(p => p.FacilityId == facility.Id
                        && !p.IsDeleted
                        && (p.Status == "PendingReview" || p.Status == "AwaitingOtp"))
            .ToListAsync(ct);

        foreach (var pracReq in pendingPractitioners)
        {
            pracReq.Status = "Withdrawn";
            pracReq.WithdrawnAtUtc = withdrawnAt;
            pracReq.WithdrawnByActor = payload.WithdrawnByActor;
            pracReq.WithdrawalReason = payload.Reason;
            pracReq.UpdatedAt = now;

            if (pracReq.Affiliation is not null && pracReq.Affiliation.AffiliationStatus == "AwaitingConfirmation")
            {
                pracReq.Affiliation.AffiliationStatus = "Withdrawn";
                pracReq.Affiliation.WithdrawnAtUtc = withdrawnAt;
                pracReq.Affiliation.UpdatedAt = now;
            }
        }

        if (facility.PlatformVerificationStatus != PlatformVerificationStatus.Verified)
        {
            facility.PlatformVerificationStatus = PlatformVerificationStatus.Unverified;
            facility.RejectionReason = null;
            facility.UpdatedAt = now;
        }

        DirectoryVerificationHelper.StageAuditEntry(
            dbContext,
            payloadTenantId,
            payload.WithdrawnByActor ?? sender.Address,
            payload.WithdrawnByActor ?? "Clinic Admin",
            "ClinicAdmin",
            "facility-withdrawn",
            new
            {
                facilityId = facility.Id,
                withdrawnRequestIds = pendingRequests.Select(r => r.Id).ToList(),
                withdrawnPractitionerRequestIds = pendingPractitioners.Select(r => r.Id).ToList(),
                reason = payload.Reason
            });

        await dbContext.SaveChangesAsync(ct);

        logger.LogInformation("Marked {Count} pending facility verification request(s) Withdrawn for facility {FacilityId}.",
            pendingRequests.Count, facility.Id);
    }
}
