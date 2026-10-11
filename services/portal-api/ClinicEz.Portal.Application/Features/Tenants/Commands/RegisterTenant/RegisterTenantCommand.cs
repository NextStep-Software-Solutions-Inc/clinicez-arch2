using Clerk.BackendAPI;
using FluentValidation;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Tenants.Commands.CreateTenant;

namespace ClinicEz.Portal.Application.Features.Tenants.Commands.RegisterTenant;

public record RegisterTenantCommand(
    string FirstName,
    string LastName,
    string Email,
    string Password,
    string Name,
    string TenantSlug,
    string TenantType = "Workplace"
) : IRequest<string>;

public class RegisterTenantCommandValidator : AbstractValidator<RegisterTenantCommand>
{
    public RegisterTenantCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty();
        RuleFor(x => x.LastName).NotEmpty();
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8);
        RuleFor(x => x.Name).NotEmpty();
        RuleFor(x => x.TenantSlug).NotEmpty();
        RuleFor(x => x.TenantType).NotEmpty();
    }
}

public class RegisterTenantCommandHandler(
    ClerkBackendApi clerkApiClient,
    IApplicationDbContext context,
    ISubscriptionService subscriptions,
    IClerkMetadataSync clerkMetadata,
    TimeProvider timeProvider) : IRequestHandler<RegisterTenantCommand, string>
{
    public async Task<string> Handle(RegisterTenantCommand request, CancellationToken cancellationToken)
    {
        // Pre-check: Ensure slug is not already taken
        var slug = request.TenantSlug.ToLowerInvariant();
        if (await context.Tenants.AnyAsync(t => t.TenantSlug.ToLower() == slug, cancellationToken))
        {
            throw new ValidationException("Workplace URL slug is already taken. Please choose another.");
        }

        // Pre-check: Ensure email is not already registered in DB
        var email = request.Email.ToLower();
        if (await context.Tenants.AnyAsync(t => t.Email.ToLower() == email, cancellationToken))
        {
            throw new ValidationException("An account with this email address already exists.");
        }

        // 1. Create User in Clerk. A brand-new account owns nothing yet, so the one-workspace rule cannot be hit here.
        var req = new Clerk.BackendAPI.Models.Operations.CreateUserRequestBody
        {
            EmailAddress = new List<string> { request.Email },
            Password = request.Password,
            FirstName = request.FirstName,
            LastName = request.LastName
        };
        var clerkUserRes = await clerkApiClient.Users.CreateAsync(req);
        string clerkUserId = clerkUserRes?.User?.Id ?? throw new Exception("Failed to create Clerk User.");

        // 2. Provision Tenant (and its Owner membership) in Database
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var newTenant = new Tenant
        {
            Id = Guid.NewGuid(),
            OwnerId = clerkUserId,
            Name = request.Name,
            TenantSlug = slug,
            TenantType = string.IsNullOrWhiteSpace(request.TenantType) ? "Workplace" : request.TenantType,
            FirstName = request.FirstName,
            LastName = request.LastName,
            Email = request.Email,
            CreatedAt = now,
            CreatedBy = clerkUserId
        };

        context.Tenants.Add(newTenant);
        context.WorkspaceMembers.Add(OwnerMembership.For(newTenant, now));
        await context.SaveChangesAsync(cancellationToken);

        await subscriptions.StartTrialAsync(newTenant.Id, cancellationToken);
        await clerkMetadata.SyncAsync(clerkUserId, cancellationToken);

        return clerkUserId;
    }
}