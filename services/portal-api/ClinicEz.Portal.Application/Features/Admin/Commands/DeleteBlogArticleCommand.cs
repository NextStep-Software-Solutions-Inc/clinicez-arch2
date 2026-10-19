using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record DeleteBlogArticleCommand(Guid Id) : IRequest<bool>;

public class DeleteBlogArticleCommandHandler(IApplicationDbContext context) : IRequestHandler<DeleteBlogArticleCommand, bool>
{
    public async Task<bool> Handle(DeleteBlogArticleCommand request, CancellationToken cancellationToken)
    {
        var blog = await context.BlogArticles.FirstOrDefaultAsync(b => b.Id == request.Id, cancellationToken);
        if (blog == null) return false;

        context.BlogArticles.Remove(blog);
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
