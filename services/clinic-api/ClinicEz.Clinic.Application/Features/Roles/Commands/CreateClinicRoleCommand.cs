using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Roles.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Roles.Commands;

public sealed record CreateClinicRoleCommand(
    string Name,
    string? Description,
    List<string> Permissions) : IRequest<ClinicRoleDto>;

public sealed class CreateClinicRoleCommandValidator : AbstractValidator<CreateClinicRoleCommand>
{
    public CreateClinicRoleCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(255);
        RuleFor(x => x.Permissions).NotNull();
        RuleForEach(x => x.Permissions)
            .Must(p => ClinicPermissions.All.Contains(p))
            .WithMessage("Permission '{PropertyValue}' is not a recognized system permission.");
    }
}

public sealed class CreateClinicRoleCommandHandler : IRequestHandler<CreateClinicRoleCommand, ClinicRoleDto>
{
    private readonly IRepository<Role> _roleRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CreateClinicRoleCommandHandler(
        IRepository<Role> roleRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _roleRepository = roleRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<ClinicRoleDto> Handle(CreateClinicRoleCommand request, CancellationToken cancellationToken)
    {
        var existing = await _roleRepository.Query(r => 
            r.ClinicId == _clinicContext.ClinicId && 
            r.Name.ToLower() == request.Name.ToLower())
            .FirstOrDefaultAsync(cancellationToken);

        if (existing != null)
        {
            throw new ConflictException($"A role named '{request.Name}' already exists in this clinic.");
        }

        var role = new Role
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            IsSystem = false,
            Permissions = request.Permissions.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin"
        };

        await _roleRepository.AddAsync(role, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new ClinicRoleDto(
            role.Id,
            role.TenantId,
            role.ClinicId,
            role.Name,
            role.Description,
            role.IsSystem,
            role.Permissions,
            0,
            role.CreatedAt);
    }
}
