using System.Collections.Generic;
using System.Linq;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.Notifications;


/// <summary>Asks for the staff invitation email of a pending <see cref="WorkspaceMember"/>.</summary>
public interface IStaffInvitationNotifier
{
    /// <summary>
    /// Enqueues the invitation email into Hangfire for background delivery.
    /// </summary>
    void RequestInvitation(Tenant tenant, WorkspaceMember member, string roleLabel, string? facilityName);
}

public sealed class StaffInvitationNotifier(
    INotificationService notifications,
    IFrontendUrlProvider frontendUrl,
    ILogger<StaffInvitationNotifier> logger) : IStaffInvitationNotifier
{
    public void RequestInvitation(Tenant tenant, WorkspaceMember member, string roleLabel, string? facilityName)
    {
        var baseUrl = frontendUrl.GetBaseUrl();
        if (baseUrl is null)
        {
            logger.LogWarning("Invitation email for staff member {StaffMemberId} skipped: the frontend address is unknown (set FrontendBaseUrl).", member.Id);
            return;
        }

        var model = new Dictionary<string, string>
        {
            ["inviteeName"] = member.FullName,
            ["workspaceName"] = tenant.Name,
            ["role"] = roleLabel,
            ["inviteUrl"] = $"{baseUrl}/invitations/{member.InvitationToken}"
        };
        if (!string.IsNullOrWhiteSpace(facilityName)) model["facilityName"] = facilityName;

        var jobId = notifications.EnqueueEmail(
            new NotificationEmailRequestedPayload
            {
                To = member.Email,
                Subject = $"You've been invited to join {SingleLine(tenant.Name)} on Clinic EZ",
                TemplateKey = EmailTemplateKeys.StaffInvitation,
                Model = model,
                FromFacilityName = tenant.Name
            },
            member.Id);

        logger.LogInformation("Enqueued staff invitation email job {JobId} for {Email} ({MemberId}).", jobId, member.Email, member.Id);
    }

    private static string SingleLine(string value) =>
        new(value.Select(c => char.IsControl(c) ? ' ' : c).ToArray());
}
