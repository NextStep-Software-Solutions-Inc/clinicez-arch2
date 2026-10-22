using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Newsletter.Commands;

public record SubscribeNewsletterCommand(string Email, string Source = "website", string? IpHash = null, string? TurnstileToken = null) : IRequest<SubscribeNewsletterResult>;

public record SubscribeNewsletterResult(bool Success, string Message, bool AlreadySubscribed = false);

public class SubscribeNewsletterCommandHandler(IApplicationDbContext context)
    : IRequestHandler<SubscribeNewsletterCommand, SubscribeNewsletterResult>
{
    public async Task<SubscribeNewsletterResult> Handle(SubscribeNewsletterCommand request, CancellationToken cancellationToken)
    {
        var cleanEmail = request.Email?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(cleanEmail) || !cleanEmail.Contains('@'))
        {
            return new SubscribeNewsletterResult(false, "Invalid email address.");
        }

        var existing = await context.NewsletterSubscribers
            .FirstOrDefaultAsync(s => s.Email == cleanEmail, cancellationToken);

        if (existing != null)
        {
            if (existing.Status == "Active")
            {
                return new SubscribeNewsletterResult(true, "You're already subscribed to Clinic EZ updates!", AlreadySubscribed: true);
            }

            existing.Status = "Active";
            existing.SubscribedAt = DateTime.UtcNow;
            existing.UnsubscribedAt = null;
            existing.UpdatedAt = DateTime.UtcNow;
            await context.SaveChangesAsync(cancellationToken);
            return new SubscribeNewsletterResult(true, "Welcome back! Your subscription to Clinic EZ updates has been reactivated.");
        }

        var subscriber = new NewsletterSubscriber
        {
            Email = cleanEmail,
            Source = string.IsNullOrWhiteSpace(request.Source) ? "website" : request.Source.Trim(),
            Status = "Active",
            SubscribedAt = DateTime.UtcNow,
            IpHash = request.IpHash,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "PublicSubscription"
        };

        context.NewsletterSubscribers.Add(subscriber);
        await context.SaveChangesAsync(cancellationToken);

        return new SubscribeNewsletterResult(true, "Thank you for subscribing to Clinic EZ updates!");
    }
}
