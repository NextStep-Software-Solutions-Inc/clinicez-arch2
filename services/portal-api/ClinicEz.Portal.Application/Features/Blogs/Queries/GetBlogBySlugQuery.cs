using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Blogs.Queries;

public record GetBlogBySlugQuery(string Slug) : IRequest<BlogArticle?>;

public class GetBlogBySlugQueryHandler(IApplicationDbContext context) : IRequestHandler<GetBlogBySlugQuery, BlogArticle?>
{
    public async Task<BlogArticle?> Handle(GetBlogBySlugQuery request, CancellationToken cancellationToken)
    {
        var blog = await context.BlogArticles
            .FirstOrDefaultAsync(b => b.Slug.ToLower() == request.Slug.ToLower() && b.Status == "Published", cancellationToken);

        if (blog != null)
        {
            blog.Views++;
            await context.SaveChangesAsync(cancellationToken);
        }

        return blog;
    }
}
