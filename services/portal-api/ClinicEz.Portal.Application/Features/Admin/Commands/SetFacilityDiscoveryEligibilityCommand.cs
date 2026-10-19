using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Application.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public sealed record SetFacilityDiscoveryEligibilityCommand(
    Guid FacilityId,
    string TenantId,
    bool IsEligible
) : IRequest<SetFacilityDiscoveryEligibilityResult>;

public sealed record SetFacilityDiscoveryEligibilityResult(
    Guid FacilityId,
    bool IsEligible,
    DateTime? UpdatedAt
);

public sealed class SetFacilityDiscoveryEligibilityCommandValidator : AbstractValidator<SetFacilityDiscoveryEligibilityCommand>
{
    public SetFacilityDiscoveryEligibilityCommandValidator()
    {
        RuleFor(x => x.FacilityId).NotEmpty().WithMessage("Facility ID is required.");
        RuleFor(x => x.TenantId).NotEmpty().WithMessage("Tenant identifier is required.");
    }
}

public sealed class SetFacilityDiscoveryEligibilityCommandHandler(
    IApplicationDbContext context,
    IFacilityProvisioningPublisher provisioningPublisher)
    : IRequestHandler<SetFacilityDiscoveryEligibilityCommand, SetFacilityDiscoveryEligibilityResult>
{
    public async Task<SetFacilityDiscoveryEligibilityResult> Handle(
        SetFacilityDiscoveryEligibilityCommand request,
        CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(
                t => t.Id.ToString() == request.TenantId || t.TenantSlug.ToLower() == request.TenantId.ToLower(),
                cancellationToken);

        if (tenant == null)
        {
            throw new KeyNotFoundException($"Workspace '{request.TenantId}' was not found.");
        }

        var facility = await context.Facilities
            .FirstOrDefaultAsync(
                f => f.Id == request.FacilityId && f.TenantId == tenant.Id && !f.IsDeleted,
                cancellationToken);

        if (facility == null)
        {
            throw new KeyNotFoundException($"Facility '{request.FacilityId}' was not found in workspace '{tenant.TenantSlug}'.");
        }

        facility.IsPatientDiscoveryEligible = request.IsEligible;
        facility.UpdatedAt = DateTime.UtcNow;

        // Stage directory update to patient-api over Interop Hub
        await provisioningPublisher.StageDirectoryUpdateAsync(tenant, facility, cancellationToken);

        await context.SaveChangesAsync(cancellationToken);

        return new SetFacilityDiscoveryEligibilityResult(
            facility.Id,
            facility.IsPatientDiscoveryEligible,
            facility.UpdatedAt ?? DateTime.UtcNow);
    }
}
