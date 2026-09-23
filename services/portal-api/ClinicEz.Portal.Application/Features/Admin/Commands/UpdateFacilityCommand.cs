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
    FacilityStatus? Status = null
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

public class UpdateFacilityCommandHandler(IApplicationDbContext context) : IRequestHandler<UpdateFacilityCommand, bool>
{
    public async Task<bool> Handle(UpdateFacilityCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.Id.ToString() == request.TenantId || t.TenantSlug.ToLower() == request.TenantId.ToLower(), cancellationToken);

        if (tenant == null) return false;

        var facility = await context.Facilities
            .FirstOrDefaultAsync(f => f.Id == request.Id && f.TenantId == tenant.Id, cancellationToken);

        if (facility == null) return false;

        facility.Name = request.Name.Trim();
        if (request.Status.HasValue)
        {
            facility.Status = request.Status.Value;
        }

        facility.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
