using MediatR;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Features.Admin.Queries;

public record GetBlogArticleByIdQuery(Guid Id) : IRequest<BlogArticle?>;

public class GetBlogArticleByIdQueryHandler(IApplicationDbContext context) : IRequestHandler<GetBlogArticleByIdQuery, BlogArticle?>
{
    public async Task<BlogArticle?> Handle(GetBlogArticleByIdQuery request, CancellationToken cancellationToken)
    {
        return await context.BlogArticles
            .FirstOrDefaultAsync(b => b.Id == request.Id, cancellationToken);
    }
}
