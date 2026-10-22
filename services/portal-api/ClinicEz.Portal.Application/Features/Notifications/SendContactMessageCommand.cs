using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Interoperability;
using FluentValidation;
using MediatR;

namespace ClinicEz.Portal.Application.Features.Notifications;

/// <summary>
/// A visitor's message from the public "Contact us" form. It is emailed to the inbox configured in
/// Platform Settings (<c>Mailer:ContactInbox</c>); the visitor never chooses the recipient or the template.
/// </summary>
public record SendContactMessageCommand(string Name, string Email, string Message) : IRequest<bool>;

public class SendContactMessageCommandValidator : AbstractValidator<SendContactMessageCommand>
{
    public SendContactMessageCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Email).NotEmpty().MaximumLength(254).EmailAddress();
        RuleFor(x => x.Message).NotEmpty().MaximumLength(2000);
    }
}

/// <summary>Returns false when no contact inbox is configured in Platform Settings (nothing is sent).</summary>
public class SendContactMessageCommandHandler(
    IApplicationDbContext context,
    INotificationService notifications,
    ISystemSettingsService settingsService) : IRequestHandler<SendContactMessageCommand, bool>
{
    public async Task<bool> Handle(SendContactMessageCommand request, CancellationToken cancellationToken)
    {
        var inbox = (await settingsService.GetSettingValueAsync("Mailer:ContactInbox", string.Empty, cancellationToken))?.Trim();
        if (string.IsNullOrEmpty(inbox)) return false;

        notifications.RequestEmail(
            new NotificationEmailRequestedPayload
            {
                To = inbox,
                Subject = "Contact Us Message",
                TemplateKey = EmailTemplateKeys.ContactMessage,
                Model = new Dictionary<string, string>
                {
                    ["name"] = request.Name.Trim(),
                    ["email"] = request.Email.Trim(),
                    ["message"] = request.Message.Trim()
                }
            },
            Guid.NewGuid());

        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
