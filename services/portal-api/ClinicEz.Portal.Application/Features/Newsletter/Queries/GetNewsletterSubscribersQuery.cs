using ClinicEz.Portal.Application.Features.Newsletter.DTOs;
using ClinicEz.Portal.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Newsletter.Queries;

public record GetNewsletterSubscribersQuery(string? Search = null) : IRequest<NewsletterSubscribersListResponse>;

public class GetNewsletterSubscribersQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetNewsletterSubscribersQuery, NewsletterSubscribersListResponse>
{
    public async Task<NewsletterSubscribersListResponse> Handle(GetNewsletterSubscribersQuery request, CancellationToken cancellationToken)
    {
        var query = context.NewsletterSubscribers
            .AsNoTracking()
            .Where(s => !s.IsDeleted);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLower();
            query = query.Where(s => s.Email.ToLower().Contains(term) || s.Source.ToLower().Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(s => s.SubscribedAt)
            .Select(s => new NewsletterSubscriberDto(
                s.Id,
                s.Email,
                s.Source,
                s.Status,
                s.SubscribedAt
            ))
            .ToListAsync(cancellationToken);

        return new NewsletterSubscribersListResponse(items, total);
    }
}
