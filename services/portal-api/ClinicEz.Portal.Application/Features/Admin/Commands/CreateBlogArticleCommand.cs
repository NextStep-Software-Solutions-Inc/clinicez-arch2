using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record CreateBlogArticleCommand(
    string Title,
    string Slug,
    string Content,
    string Summary,
    string Author,
    string Category,
    string Status,
    string CreatedBy,
    string? BannerUrl
) : IRequest<BlogArticle?>;

public class CreateBlogArticleCommandHandler(IApplicationDbContext context) : IRequestHandler<CreateBlogArticleCommand, BlogArticle?>
{
    public async Task<BlogArticle?> Handle(CreateBlogArticleCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.Title) || string.IsNullOrEmpty(request.Slug)) return null;

        var existing = await context.BlogArticles.AnyAsync(b => b.Slug == request.Slug, cancellationToken);
        if (existing) throw new Exception("Slug must be unique.");

        var article = new BlogArticle
        {
            Id = Guid.NewGuid(),
            Title = request.Title,
            Slug = request.Slug,
            Content = request.Content,
            Summary = request.Summary,
            Author = request.Author,
            Category = request.Category,
            Status = request.Status,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.CreatedBy,
            PublishedAt = request.Status == "Published" ? DateTime.UtcNow : null,
            BannerUrl = request.BannerUrl,
            Views = 0
        };

        await context.BlogArticles.AddAsync(article, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);
        return article;
    }
}
