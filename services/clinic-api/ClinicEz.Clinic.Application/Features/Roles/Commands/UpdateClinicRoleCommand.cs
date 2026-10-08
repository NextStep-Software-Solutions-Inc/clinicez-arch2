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

public sealed record UpdateClinicRoleCommand(
    Guid Id,
    string Name,
    string? Description,
    List<string> Permissions) : IRequest<ClinicRoleDto>;

public sealed class UpdateClinicRoleCommandValidator : AbstractValidator<UpdateClinicRoleCommand>
{
    public UpdateClinicRoleCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(255);
        RuleFor(x => x.Permissions).NotNull();
        RuleForEach(x => x.Permissions)
            .Must(p => ClinicPermissions.All.Contains(p))
            .WithMessage("Permission '{PropertyValue}' is not a recognized system permission.");
    }
}

public sealed class UpdateClinicRoleCommandHandler : IRequestHandler<UpdateClinicRoleCommand, ClinicRoleDto>
{
    private readonly IRepository<ClinicRole> _roleRepository;
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpdateClinicRoleCommandHandler(
        IRepository<ClinicRole> roleRepository,
        IRepository<StaffMember> staffRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _roleRepository = roleRepository;
        _staffRepository = staffRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<ClinicRoleDto> Handle(UpdateClinicRoleCommand request, CancellationToken cancellationToken)
    {
        var role = await _roleRepository.Query(r => r.Id == request.Id && r.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (role == null)
        {
            throw new NotFoundException($"Role with ID '{request.Id}' was not found in this clinic.");
        }

        if (role.IsSystem)
        {
            throw new BadRequestException("Default system roles cannot be modified.");
        }

        var duplicate = await _roleRepository.Query(r => 
            r.ClinicId == _clinicContext.ClinicId && 
            r.Id != request.Id && 
            r.Name.ToLower() == request.Name.ToLower())
            .AnyAsync(cancellationToken);

        if (duplicate)
        {
            throw new ConflictException($"A role named '{request.Name}' already exists in this clinic.");
        }

        role.Name = request.Name.Trim();
        role.Description = request.Description?.Trim();
        role.Permissions = request.Permissions.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        role.UpdatedAt = DateTime.UtcNow;
        role.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";

        _roleRepository.Update(role);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var staffCount = await _staffRepository.Query(s => s.ClinicRoleId == role.Id).CountAsync(cancellationToken);

        return new ClinicRoleDto(
            role.Id,
            role.TenantId,
            role.ClinicId,
            role.Name,
            role.Description,
            role.IsSystem,
            role.Permissions,
            staffCount,
            role.CreatedAt);
    }
}

public sealed record DeleteClinicRoleCommand(Guid Id) : IRequest<bool>;

public sealed class DeleteClinicRoleCommandHandler : IRequestHandler<DeleteClinicRoleCommand, bool>
{
    private readonly IRepository<ClinicRole> _roleRepository;
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public DeleteClinicRoleCommandHandler(
        IRepository<ClinicRole> roleRepository,
        IRepository<StaffMember> staffRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _roleRepository = roleRepository;
        _staffRepository = staffRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<bool> Handle(DeleteClinicRoleCommand request, CancellationToken cancellationToken)
    {
        var role = await _roleRepository.Query(r => r.Id == request.Id && r.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (role == null)
        {
            throw new NotFoundException($"Role with ID '{request.Id}' was not found in this clinic.");
        }

        if (role.IsSystem)
        {
            throw new BadRequestException("Default system roles cannot be deleted.");
        }

        var assignedStaff = await _staffRepository.Query(s => s.ClinicRoleId == role.Id).AnyAsync(cancellationToken);
        if (assignedStaff)
        {
            throw new BadRequestException("Cannot delete role while active staff members are assigned to it.");
        }

        _roleRepository.Remove(role);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return true;
    }
}
