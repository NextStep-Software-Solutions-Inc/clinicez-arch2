using MediatR;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Features.Blogs.Queries;

public record GetPublishedBlogsQuery : IRequest<List<BlogArticle>>;

public class GetPublishedBlogsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPublishedBlogsQuery, List<BlogArticle>>
{
    public async Task<List<BlogArticle>> Handle(GetPublishedBlogsQuery request, CancellationToken cancellationToken)
    {
        return await context.BlogArticles
            .Where(b => b.Status == "Published")
            .OrderByDescending(b => b.PublishedAt ?? b.CreatedAt)
            .ToListAsync(cancellationToken);
    }
}
