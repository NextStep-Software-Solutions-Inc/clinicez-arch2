using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Staff.Commands;

public sealed record CreateStaffMemberCommand(
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    StaffRole Role,
    Guid? ClinicRoleId,
    string? Email,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? PtrNumber,
    string? S2LicenseNumber,
    string? Specialty) : IRequest<StaffMemberDto>;

public sealed class CreateStaffMemberCommandValidator : AbstractValidator<CreateStaffMemberCommand>
{
    public CreateStaffMemberCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Role).IsInEnum();

        // Philippine regulatory compliance: Doctors must provide PRC License Number
        When(x => x.Role == StaffRole.Doctor, () =>
        {
            RuleFor(x => x.PrcLicenseNumber)
                .NotEmpty()
                .WithMessage("PRC License Number is mandatory for Doctors.");
        });
    }
}

public sealed class CreateStaffMemberCommandHandler : IRequestHandler<CreateStaffMemberCommand, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IRepository<ClinicRole> _roleRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CreateStaffMemberCommandHandler(
        IRepository<StaffMember> staffRepository,
        IRepository<ClinicRole> roleRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _staffRepository = staffRepository;
        _roleRepository = roleRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<StaffMemberDto> Handle(CreateStaffMemberCommand request, CancellationToken cancellationToken)
    {
        Guid? assignedRoleId = request.ClinicRoleId;
        string? assignedRoleName = null;

        if (assignedRoleId.HasValue)
        {
            var role = await _roleRepository.Query(r => r.Id == assignedRoleId.Value && r.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);

            if (role == null)
            {
                throw new NotFoundException($"Role '{assignedRoleId.Value}' does not exist in this clinic.");
            }
            assignedRoleName = role.Name;
        }
        else
        {
            // Auto-assign default system role matching category
            var defaultRoleName = request.Role switch
            {
                StaffRole.Doctor => "Attending Physician / Doctor",
                StaffRole.Nurse => "Triage Nurse",
                StaffRole.Receptionist => "Front Desk Receptionist",
                StaffRole.Admin => "Clinic Administrator",
                _ => null
            };

            if (defaultRoleName != null)
            {
                var defaultRole = await _roleRepository.Query(r => 
                    r.ClinicId == _clinicContext.ClinicId && 
                    r.Name == defaultRoleName)
                    .FirstOrDefaultAsync(cancellationToken);

                if (defaultRole != null)
                {
                    assignedRoleId = defaultRole.Id;
                    assignedRoleName = defaultRole.Name;
                }
            }
        }

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            ClinicRoleId = assignedRoleId,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            MiddleName = request.MiddleName?.Trim(),
            Title = request.Title?.Trim(),
            Role = request.Role,
            Email = request.Email?.Trim(),
            PhoneNumber = request.PhoneNumber?.Trim(),
            PrcLicenseNumber = request.PrcLicenseNumber?.Trim(),
            PtrNumber = request.PtrNumber?.Trim(),
            S2LicenseNumber = request.S2LicenseNumber?.Trim(),
            Specialty = request.Specialty?.Trim(),
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin"
        };

        await _staffRepository.AddAsync(staff, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new StaffMemberDto(
            staff.Id,
            staff.TenantId,
            staff.ClinicId,
            staff.ClinicRoleId,
            assignedRoleName,
            staff.FirstName,
            staff.LastName,
            staff.MiddleName,
            staff.Title,
            staff.Role,
            staff.Email,
            staff.PhoneNumber,
            staff.PrcLicenseNumber,
            staff.PtrNumber,
            staff.S2LicenseNumber,
            staff.Specialty,
            staff.IsActive,
            staff.CreatedAt);
    }
}
