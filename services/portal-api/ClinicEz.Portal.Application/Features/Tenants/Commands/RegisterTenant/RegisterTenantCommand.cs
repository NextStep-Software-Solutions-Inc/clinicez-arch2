using Clerk.BackendAPI;
using FluentValidation;
using ClinicEz.Portal.Domain.Interfaces;
using MediatR;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

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

public class RegisterTenantCommandHandler : IRequestHandler<RegisterTenantCommand, string>
{
    private readonly ClerkBackendApi _clerkApiClient;
    private readonly IUnitOfWork _unitOfWork;

    public RegisterTenantCommandHandler(ClerkBackendApi clerkApiClient, IUnitOfWork unitOfWork)
    {
        _clerkApiClient = clerkApiClient;
        _unitOfWork = unitOfWork;
    }

    public async Task<string> Handle(RegisterTenantCommand request, CancellationToken cancellationToken)
    {
        // Pre-check: Ensure slug is not already taken
        var existingSlug = await _unitOfWork.TenantRepository.FindAsync(
            t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower(), 
            cancellationToken);

        if (existingSlug != null)
        {
            throw new ValidationException("Workplace URL slug is already taken. Please choose another.");
        }

        // Pre-check: Ensure email is not already registered in DB
        var existingEmail = await _unitOfWork.TenantRepository.FindAsync(
            t => t.Email.ToLower() == request.Email.ToLower(), 
            cancellationToken);

        if (existingEmail != null)
        {
            throw new ValidationException("An account with this email address already exists.");
        }

        // 1. Create User in Clerk
        var req = new Clerk.BackendAPI.Models.Operations.CreateUserRequestBody
        {
            EmailAddress = new List<string> { request.Email },
            Password = request.Password,
            FirstName = request.FirstName,
            LastName = request.LastName
        };
        var clerkUserRes = await _clerkApiClient.Users.CreateAsync(req);
        string clerkUserId = clerkUserRes?.User?.Id ?? throw new Exception("Failed to create Clerk User.");

        // 2. Provision Tenant in Database
        var newTenant = new ClinicEz.Portal.Domain.Entities.Tenant
        {
            OwnerId = clerkUserId,
            Name = request.Name,
            TenantSlug = request.TenantSlug.ToLowerInvariant(),
            TenantType = string.IsNullOrWhiteSpace(request.TenantType) ? "Workplace" : request.TenantType,
            FirstName = request.FirstName,
            LastName = request.LastName,
            Email = request.Email,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = clerkUserId
        };

        await _unitOfWork.TenantRepository.AddAsync(newTenant);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return clerkUserId;
    }
}
