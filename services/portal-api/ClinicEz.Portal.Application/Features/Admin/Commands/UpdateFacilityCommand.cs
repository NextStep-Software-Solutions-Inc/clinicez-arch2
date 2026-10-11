using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record UpdateFacilityCommand(
    Guid Id,
    string TenantId,
    string Name,
    FacilityStatus? Status = null,
    string? Slug = null
) : IRequest<bool>;

public class UpdateFacilityCommandValidator : AbstractValidator<UpdateFacilityCommand>
{
    public UpdateFacilityCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("Facility ID is required.");
        RuleFor(x => x.TenantId).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.Name).NotEmpty().MinimumLength(2).WithMessage("Facility name must be at least 2 characters.");
    }
}

public class UpdateFacilityCommandHandler(IApplicationDbContext context, IHubOnboardingService hubOnboarding) : IRequestHandler<UpdateFacilityCommand, bool>
{
    public async Task<bool> Handle(UpdateFacilityCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.Id.ToString() == request.TenantId || t.TenantSlug.ToLower() == request.TenantId.ToLower(), cancellationToken);

        if (tenant == null) return false;

        var facility = await context.Facilities
            .FirstOrDefaultAsync(f => f.Id == request.Id && f.TenantId == tenant.Id, cancellationToken);

        if (facility == null) return false;

        var trimmedName = request.Name.Trim();
        var duplicateExists = await context.Facilities.AnyAsync(f => 
            f.TenantId == tenant.Id && f.Id != request.Id && !f.IsDeleted && f.Name.ToLower() == trimmedName.ToLower(), 
            cancellationToken);

        if (duplicateExists)
        {
            throw new InvalidOperationException($"A facility named '{trimmedName}' already exists in this workspace.");
        }

        facility.Name = trimmedName;

        if (!string.IsNullOrWhiteSpace(request.Slug))
        {
            var cleanSlug = ClinicEz.Portal.Application.Features.Admin.Queries.GetFacilitiesQueryHandler.GenerateFacilitySlug(request.Slug);
            if (cleanSlug.Length < 2 || cleanSlug.Length > 63)
            {
                throw new InvalidOperationException("Facility slug must be between 2 and 63 characters.");
            }

            var slugDuplicate = await context.Facilities.AnyAsync(f => 
                f.Id != request.Id && !f.IsDeleted && f.Slug.ToLower() == cleanSlug.ToLower(), 
                cancellationToken);

            if (slugDuplicate)
            {
                throw new InvalidOperationException($"The facility slug '{cleanSlug}' is already taken. Please choose another unique subdomain slug.");
            }

            facility.Slug = cleanSlug;
        }

        if (request.Status.HasValue)
        {
            facility.Status = request.Status.Value;
        }

        facility.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);

        if (!FacilityCells.IsRoutable(facility))
        {
            await hubOnboarding.RevokeForFacilityAsync(facility, cancellationToken);
        }

        return true;
    }
}
