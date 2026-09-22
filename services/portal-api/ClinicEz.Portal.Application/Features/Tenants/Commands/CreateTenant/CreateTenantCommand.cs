using ClinicEz.Portal.Application.Features.Tenants.Queries.GetTenantByOwner;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Domain.Interfaces;
using FluentValidation;
using MediatR;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Tenants.Commands.CreateTenant;

public record CreateTenantCommand(
    string OwnerId,
    string Name,
    string TenantSlug,
    string TenantType = "Workplace",
    string? FirstName = null,
    string? LastName = null,
    string? Email = null
) : IRequest<TenantDto>;

public class CreateTenantCommandHandler : IRequestHandler<CreateTenantCommand, TenantDto>
{
    private readonly IUnitOfWork _unitOfWork;

    public CreateTenantCommandHandler(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<TenantDto> Handle(CreateTenantCommand request, CancellationToken cancellationToken)
    {
        // 1. Check if the user already has a tenant (idempotent / safeguard)
        var existingOwnerTenant = await _unitOfWork.TenantRepository.FindAsync(
            t => t.OwnerId == request.OwnerId, 
            cancellationToken);

        if (existingOwnerTenant != null)
        {
            return new TenantDto(
                existingOwnerTenant.TenantSlug, 
                existingOwnerTenant.Name, 
                existingOwnerTenant.TenantType);
        }

        // 2. Validate TenantSlug uniqueness across all tenants
        var existingSlugTenant = await _unitOfWork.TenantRepository.FindAsync(
            t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower(), 
            cancellationToken);

        if (existingSlugTenant != null)
        {
            throw new ValidationException("Workplace URL slug is already taken. Please choose a different URL.");
        }

        // 3. Provision Tenant directly without creating duplicate Clerk account
        var tenantType = string.IsNullOrWhiteSpace(request.TenantType) ? "Workplace" : request.TenantType;

        var newTenant = new Tenant
        {
            OwnerId = request.OwnerId,
            Name = request.Name.Trim(),
            TenantSlug = request.TenantSlug.Trim().ToLowerInvariant(),
            TenantType = tenantType,
            FirstName = request.FirstName ?? string.Empty,
            LastName = request.LastName ?? string.Empty,
            Email = request.Email ?? string.Empty,
            SubscriptionStatus = "TRIALING",
            SubscriptionPlanId = "starter",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.OwnerId
        };

        await _unitOfWork.TenantRepository.AddAsync(newTenant);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new TenantDto(newTenant.TenantSlug, newTenant.Name, newTenant.TenantType);
    }
}
