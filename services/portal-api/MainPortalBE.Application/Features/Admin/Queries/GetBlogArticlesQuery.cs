using MediatR;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Features.Admin.Queries;

public record GetBlogArticlesQuery : IRequest<List<BlogArticle>>;

public class GetBlogArticlesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetBlogArticlesQuery, List<BlogArticle>>
{
    public async Task<List<BlogArticle>> Handle(GetBlogArticlesQuery request, CancellationToken cancellationToken)
    {
        return await context.BlogArticles
            .OrderByDescending(b => b.CreatedAt)
            .ToListAsync(cancellationToken);
    }
}
