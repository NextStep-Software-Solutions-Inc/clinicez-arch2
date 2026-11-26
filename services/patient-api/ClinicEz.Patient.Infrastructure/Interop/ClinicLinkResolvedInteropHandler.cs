using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Handles <see cref="InteropTypes.ClinicLinkResolved"/> replies from a clinic once staff approve or reject
/// a patient's chart linkage request. Activates or rejects <see cref="ClinicMembership"/> and notifies the patient.
/// </summary>
public sealed class ClinicLinkResolvedInteropHandler : IInteropHandler<ClinicLinkResolvedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<ClinicLinkResolvedInteropHandler> _logger;

    public ClinicLinkResolvedInteropHandler(
        ApplicationDbContext dbContext,
        ILogger<ClinicLinkResolvedInteropHandler> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task HandleAsync(ClinicLinkResolvedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        if (context.From.Kind != PartyKind.Facility
            || !string.Equals(context.From.TenantId, message.TenantId, StringComparison.Ordinal)
            || !Guid.TryParse(context.From.FacilityId, out var fromClinicId)
            || fromClinicId != message.ClinicId
            || context.To.Kind != PartyKind.Patient
            || !string.Equals(context.To.PatientId, message.PatientId.ToString(), StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning(
                "Ignoring clinic.link.resolved {MessageId}: sender {From} or recipient {To} does not match payload.",
                context.MessageId, context.From.Address, context.To.Address);
            return;
        }

        var isApproved = string.Equals(message.Status, "Approved", StringComparison.OrdinalIgnoreCase);
        var now = DateTime.UtcNow;

        var membership = await _dbContext.ClinicMemberships
            .FirstOrDefaultAsync(m => !m.IsDeleted && m.PatientId == message.PatientId && m.ClinicId == message.ClinicId, ct);

        if (membership is not null)
        {
            membership.Status = isApproved ? ClinicMembershipStatus.Active : ClinicMembershipStatus.Rejected;
            membership.UpdatedAt = now;
            membership.UpdatedBy = "System:ClinicLinkResolved";
        }
        else if (isApproved)
        {
            await _dbContext.ClinicMemberships.AddAsync(new ClinicMembership
            {
                Id = message.LinkRequestId,
                ClientId = Guid.NewGuid(),
                PatientId = message.PatientId,
                ClinicId = message.ClinicId,
                Status = ClinicMembershipStatus.Active,
                ConsentPrivacyPolicy = true,
                ConsentTermsAndConditions = true,
                ConsentDataSharing = true,
                ConsentedAt = now,
                CreatedBy = "System:ClinicLinkResolved"
            }, ct);
        }

        var sourceId = message.LinkRequestId.ToString();
        var payloadJson = $"{{\"linkRequestId\":\"{message.LinkRequestId}\",\"clinicId\":\"{message.ClinicId}\",\"status\":\"{message.Status}\"}}";
        var alreadyNotified = await _dbContext.Notifications.AnyAsync(
            n => n.PatientId == message.PatientId && n.SourceId == sourceId && n.Payload == payloadJson, ct);

        if (!alreadyNotified)
        {
            await _dbContext.Notifications.AddAsync(new Notification
            {
                Id = Guid.NewGuid(),
                PatientId = message.PatientId,
                Type = NotificationType.System,
                Category = NotificationCategory.Clinic,
                Title = isApproved ? "Clinic Chart Linked" : "Chart Link Request Declined",
                Body = isApproved
                    ? "Your clinic verified your identity and linked your ClinicEZ account to your medical chart."
                    : $"Your clinic could not verify your chart linkage request: {message.RejectionReason ?? "Please verify your details at the clinic reception desk."}",
                IsRead = false,
                SourceId = sourceId,
                Payload = payloadJson,
                CreatedAt = now
            }, ct);
        }

        await _dbContext.SaveChangesAsync(ct);
        _logger.LogInformation(
            "[ClinicEz.Patient] Processed clinic.link.resolved for patient {PatientId}, clinic {ClinicId}, status {Status}.",
            message.PatientId, message.ClinicId, message.Status);
    }
}
