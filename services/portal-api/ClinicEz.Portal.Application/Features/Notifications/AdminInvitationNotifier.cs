using System.Collections.Generic;
using System.Linq;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.Notifications;

public interface IAdminInvitationNotifier
{
    void RequestInvitation(AdminUser user, string roleName, string? inviterName = null);
}

public sealed class AdminInvitationNotifier(
    INotificationService notifications,
    IFrontendUrlProvider frontendUrl,
    ILogger<AdminInvitationNotifier> logger) : IAdminInvitationNotifier
{
    public void RequestInvitation(AdminUser user, string roleName, string? inviterName = null)
    {
        var baseUrl = frontendUrl.GetAdminBaseUrl() ?? frontendUrl.GetBaseUrl();
        if (baseUrl is null)
        {
            logger.LogWarning("Admin invitation email for {AdminUserId} skipped: the frontend address is unknown (set AdminBaseUrl or FrontendBaseUrl).", user.Id);
            return;
        }

        var model = new Dictionary<string, string>
        {
            ["inviteeName"] = user.FullName,
            ["role"] = roleName,
            ["inviteUrl"] = $"{baseUrl.TrimEnd('/')}/invitations/{user.InvitationToken}"
        };
        if (!string.IsNullOrWhiteSpace(inviterName)) model["inviterName"] = inviterName;

        var jobId = notifications.EnqueueEmail(
            new NotificationEmailRequestedPayload
            {
                To = user.Email,
                Subject = $"You've been invited to join Clinic EZ Platform Administration as {SingleLine(roleName)}",
                TemplateKey = EmailTemplateKeys.AdminInvitation,
                Model = model,
                FromFacilityName = "Clinic EZ Platform"
            },
            user.Id);

        logger.LogInformation("Enqueued admin invitation email job {JobId} for {Email} ({UserId}).", jobId, user.Email, user.Id);
    }

    private static string SingleLine(string value) =>
        new(value.Select(c => char.IsControl(c) ? ' ' : c).ToArray());
}
