using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Ownership;
using ClinicEz.Portal.Application.Features.Tenants.Queries.GetTenantByOwner;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
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

/// <summary>
/// Creates the workspace the caller will own. A person owns at most one workspace: asking for a second is a 409
/// (<see cref="ConflictCodes.OwnerAlreadyHasWorkspace"/>), never a silent return of the existing one.
/// </summary>
public class CreateTenantCommandHandler(
    IApplicationDbContext context,
    IOwnershipPolicy ownership,
    ISubscriptionService subscriptions,
    IClerkMetadataSync clerkMetadata,
    TimeProvider timeProvider) : IRequestHandler<CreateTenantCommand, TenantDto>
{
    public async Task<TenantDto> Handle(CreateTenantCommand request, CancellationToken cancellationToken)
    {
        await ownership.EnsureCanOwnAsync(request.OwnerId, ConflictCodes.OwnerAlreadyHasWorkspace, cancellationToken);

        var slug = request.TenantSlug.Trim().ToLowerInvariant();
        if (await context.Tenants.AnyAsync(t => t.TenantSlug.ToLower() == slug, cancellationToken))
        {
            throw new ValidationException("Workplace URL slug is already taken. Please choose a different URL.");
        }

        var tenantType = string.IsNullOrWhiteSpace(request.TenantType) ? "Workplace" : request.TenantType;
        var now = timeProvider.GetUtcNow().UtcDateTime;

        var newTenant = new Tenant
        {
            Id = Guid.NewGuid(),
            OwnerId = request.OwnerId,
            Name = request.Name.Trim(),
            TenantSlug = slug,
            TenantType = tenantType,
            FirstName = request.FirstName ?? string.Empty,
            LastName = request.LastName ?? string.Empty,
            Email = request.Email ?? string.Empty,
            CreatedAt = now,
            CreatedBy = request.OwnerId
        };
        context.Tenants.Add(newTenant);
        context.WorkspaceMembers.Add(OwnerMembership.For(newTenant, now));

        await ownership.SaveAsync(ConflictCodes.OwnerAlreadyHasWorkspace, cancellationToken);

        await subscriptions.StartTrialAsync(newTenant.Id, cancellationToken);
        await clerkMetadata.SyncAsync(request.OwnerId, cancellationToken);

        return new TenantDto(newTenant.TenantSlug, newTenant.Name, newTenant.TenantType);
    }
}

/// <summary>The Owner membership row every workspace is created with.</summary>
internal static class OwnerMembership
{
    public static WorkspaceMember For(Tenant tenant, DateTime now)
    {
        var fullName = $"{tenant.FirstName} {tenant.LastName}".Trim();
        if (string.IsNullOrWhiteSpace(fullName))
        {
            fullName = string.IsNullOrWhiteSpace(tenant.Name) ? "Workspace Owner" : tenant.Name;
        }

        return new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            UserId = tenant.OwnerId,
            Email = tenant.Email.Trim().ToLowerInvariant(),
            FullName = fullName,
            Role = WorkspaceMemberRole.Owner,
            Status = MemberStatus.Active,
            JoinedAt = now,
            CreatedAt = now,
            CreatedBy = tenant.OwnerId
        };
    }
}
