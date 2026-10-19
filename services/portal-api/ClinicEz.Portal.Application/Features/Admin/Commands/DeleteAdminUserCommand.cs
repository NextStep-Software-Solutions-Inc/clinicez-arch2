using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record DeleteAdminUserCommand(Guid Id, string CurrentClerkUserId) : IRequest<bool>;

public class DeleteAdminUserCommandHandler(IApplicationDbContext context) : IRequestHandler<DeleteAdminUserCommand, bool>
{
    public async Task<bool> Handle(DeleteAdminUserCommand request, CancellationToken cancellationToken)
    {
        var user = await context.AdminUsers.FirstOrDefaultAsync(u => u.Id == request.Id, cancellationToken);
        if (user == null) return false;

        // Block self-deletion
        if (user.ClerkUserId == request.CurrentClerkUserId)
        {
            throw new Exception("You cannot delete your own admin account.");
        }

        context.AdminUsers.Remove(user);
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
