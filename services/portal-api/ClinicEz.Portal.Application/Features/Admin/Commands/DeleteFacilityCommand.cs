using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Links;
using ClinicEz.Portal.Application.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record DeleteFacilityCommand(
    Guid Id,
    string TenantId
) : IRequest<bool>;

public class DeleteFacilityCommandValidator : AbstractValidator<DeleteFacilityCommand>
{
    public DeleteFacilityCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("Facility ID is required.");
        RuleFor(x => x.TenantId).NotEmpty().WithMessage("Tenant identifier is required.");
    }
}

public class DeleteFacilityCommandHandler(IApplicationDbContext context, IHubOnboardingService hubOnboarding) : IRequestHandler<DeleteFacilityCommand, bool>
{
    public async Task<bool> Handle(DeleteFacilityCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.Id.ToString() == request.TenantId || t.TenantSlug.ToLower() == request.TenantId.ToLower(), cancellationToken);

        if (tenant == null) return false;

        var facility = await context.Facilities
            .FirstOrDefaultAsync(f => f.Id == request.Id && f.TenantId == tenant.Id, cancellationToken);

        if (facility == null) return false;

        await FacilityLinkLifecycle.RevokeAllForFacilityAsync(context, facility.Id, cancellationToken);
        context.Facilities.Remove(facility);
        if (tenant.FacilitiesCount > 0)
        {
            tenant.FacilitiesCount -= 1;
        }

        tenant.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);
        await hubOnboarding.RevokeForFacilityAsync(facility, cancellationToken);
        return true;
    }
}
