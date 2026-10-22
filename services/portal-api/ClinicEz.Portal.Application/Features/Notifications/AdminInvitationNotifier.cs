using System.Collections.Generic;
using System.Linq;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.Notifications;

public interface IAdminInvitationNotifier
{
    Task RequestInvitationAsync(AdminUser user, string roleName, string? inviterName = null, CancellationToken ct = default);
    void RequestInvitation(AdminUser user, string roleName, string? inviterName = null);
}

public sealed class AdminInvitationNotifier(
    INotificationService notifications,
    IFrontendUrlProvider frontendUrl,
    ILogger<AdminInvitationNotifier> logger) : IAdminInvitationNotifier
{
    public async Task RequestInvitationAsync(AdminUser user, string roleName, string? inviterName = null, CancellationToken ct = default)
    {
        var baseUrl = frontendUrl.GetBaseUrl();
        if (baseUrl is null)
        {
            logger.LogWarning("Admin invitation email for {AdminUserId} skipped: the frontend address is unknown (set FrontendBaseUrl).", user.Id);
            return;
        }

        var model = new Dictionary<string, string>
        {
            ["inviteeName"] = user.FullName,
            ["role"] = roleName,
            ["inviteUrl"] = $"{baseUrl}/admin/invitations/{user.InvitationToken}"
        };
        if (!string.IsNullOrWhiteSpace(inviterName)) model["inviterName"] = inviterName;

        try
        {
            await notifications.RequestEmailAsync(
                new NotificationEmailRequestedPayload
                {
                    To = user.Email,
                    Subject = $"You've been invited to join Clinic EZ Platform Administration as {SingleLine(roleName)}",
                    TemplateKey = EmailTemplateKeys.AdminInvitation,
                    Model = model,
                    FromFacilityName = "Clinic EZ Platform"
                },
                user.Id,
                ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to deliver admin invitation email to {Email} for user {UserId}: {ErrorMessage}", user.Email, user.Id, ex.Message);
        }
    }

    public void RequestInvitation(AdminUser user, string roleName, string? inviterName = null) =>
        RequestInvitationAsync(user, roleName, inviterName, CancellationToken.None).GetAwaiter().GetResult();

    private static string SingleLine(string value) =>
        new(value.Select(c => char.IsControl(c) ? ' ' : c).ToArray());
}
