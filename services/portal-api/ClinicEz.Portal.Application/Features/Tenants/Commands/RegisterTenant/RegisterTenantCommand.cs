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
    string ClinicName,
    string TenantSlug,
    string FacilityType
) : IRequest<string>;

public class RegisterTenantCommandValidator : AbstractValidator<RegisterTenantCommand>
{
    public RegisterTenantCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty();
        RuleFor(x => x.LastName).NotEmpty();
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8);
        RuleFor(x => x.ClinicName).NotEmpty();
        RuleFor(x => x.TenantSlug).NotEmpty();
        RuleFor(x => x.FacilityType).NotEmpty();
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
            ClinicName = request.ClinicName,
            TenantSlug = request.TenantSlug,
            FacilityType = request.FacilityType,
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
