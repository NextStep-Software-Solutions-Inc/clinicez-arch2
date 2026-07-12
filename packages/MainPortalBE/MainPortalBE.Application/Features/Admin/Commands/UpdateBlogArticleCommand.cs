using MediatR;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Features.Admin.Commands;

public record UpdateBlogArticleCommand(
    Guid Id,
    string Title,
    string Slug,
    string Content,
    string Summary,
    string Author,
    string Category,
    string Status,
    string UpdatedBy,
    string? BannerUrl
) : IRequest<BlogArticle?>;

public class UpdateBlogArticleCommandHandler(IApplicationDbContext context) : IRequestHandler<UpdateBlogArticleCommand, BlogArticle?>
{
    public async Task<BlogArticle?> Handle(UpdateBlogArticleCommand request, CancellationToken cancellationToken)
    {
        var blog = await context.BlogArticles.FirstOrDefaultAsync(b => b.Id == request.Id, cancellationToken);
        if (blog == null) return null;

        if (string.IsNullOrEmpty(request.Title) || string.IsNullOrEmpty(request.Slug)) return null;

        var existing = await context.BlogArticles.AnyAsync(b => b.Slug == request.Slug && b.Id != request.Id, cancellationToken);
        if (existing) throw new Exception("Slug must be unique.");

        blog.Title = request.Title;
        blog.Slug = request.Slug;
        blog.Content = request.Content;
        blog.Summary = request.Summary;
        blog.Author = request.Author;
        blog.Category = request.Category;
        blog.BannerUrl = request.BannerUrl;
        
        if (blog.Status != "Published" && request.Status == "Published")
        {
            blog.PublishedAt = DateTime.UtcNow;
        }
        blog.Status = request.Status;
        blog.UpdatedAt = DateTime.UtcNow;
        blog.UpdatedBy = request.UpdatedBy;

        await context.SaveChangesAsync(cancellationToken);
        return blog;
    }
}
