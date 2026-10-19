using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record GetBlogArticleByIdQuery(Guid Id) : IRequest<BlogArticle?>;

public class GetBlogArticleByIdQueryHandler(IApplicationDbContext context) : IRequestHandler<GetBlogArticleByIdQuery, BlogArticle?>
{
    public async Task<BlogArticle?> Handle(GetBlogArticleByIdQuery request, CancellationToken cancellationToken)
    {
        return await context.BlogArticles
            .FirstOrDefaultAsync(b => b.Id == request.Id, cancellationToken);
    }
}
