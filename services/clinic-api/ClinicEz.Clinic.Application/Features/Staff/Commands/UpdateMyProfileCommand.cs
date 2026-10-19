using System;
using System.Collections.Generic;
using System.Linq;
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

public sealed record UpdateMyProfileCommand(
    Guid StaffId,
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? PtrNumber,
    string? S2LicenseNumber,
    string? Specialty,
    string? PhilHealthPan = null,
    StaffRole? RequestedRole = null,
    Guid? RequestedClinicRoleId = null) : IRequest<StaffMemberDto>;

public sealed class UpdateMyProfileCommandValidator : AbstractValidator<UpdateMyProfileCommand>
{
    public UpdateMyProfileCommandValidator()
    {
        RuleFor(x => x.StaffId).NotEmpty();
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);

        When(x => !string.IsNullOrEmpty(x.PhilHealthPan), () =>
        {
            RuleFor(x => x.PhilHealthPan).MaximumLength(50);
        });
    }
}

public sealed class UpdateMyProfileCommandHandler : IRequestHandler<UpdateMyProfileCommand, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IStaffAccessInvalidator? _accessCache;
    private readonly IRepository<ClinicRoom>? _roomRepository;

    public UpdateMyProfileCommandHandler(
        IRepository<StaffMember> staffRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IStaffAccessInvalidator? accessCache = null,
        IRepository<ClinicRoom>? roomRepository = null)
    {
        _staffRepository = staffRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _accessCache = accessCache;
        _roomRepository = roomRepository;
    }

    public async Task<StaffMemberDto> Handle(UpdateMyProfileCommand request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepository.Query(s => s.Id == request.StaffId && s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.StaffId}' was not found in this clinic.");
        }

        if ((request.RequestedRole.HasValue && request.RequestedRole.Value != staff.Role) ||
            (request.RequestedClinicRoleId.HasValue && request.RequestedClinicRoleId.Value != staff.ClinicRoleId))
        {
            throw new ClinicEz.Shared.Exceptions.ValidationException("You cannot change or downgrade your own clinic role.");
        }

        if (staff.Role == StaffRole.Doctor && string.IsNullOrWhiteSpace(request.PrcLicenseNumber))
        {
            throw new ClinicEz.Shared.Exceptions.ValidationException("PRC License Number is mandatory for Doctors.");
        }

        staff.FirstName = request.FirstName.Trim();
        staff.LastName = request.LastName.Trim();
        staff.MiddleName = request.MiddleName?.Trim();
        staff.Title = request.Title?.Trim();
        staff.PhoneNumber = request.PhoneNumber?.Trim();
        staff.PrcLicenseNumber = request.PrcLicenseNumber?.Trim();
        staff.PtrNumber = request.PtrNumber?.Trim();
        staff.S2LicenseNumber = request.S2LicenseNumber?.Trim();
        staff.Specialty = request.Specialty?.Trim();
        staff.PhilHealthPan = request.PhilHealthPan?.Trim();
        staff.UpdatedAt = DateTime.UtcNow;
        staff.UpdatedBy = staff.Id.ToString();

        _staffRepository.Update(staff);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        _accessCache?.Invalidate(staff.Id);

        var roomIds = staff.GetAssignedRoomIds();
        var roomNames = new List<string>();
        if (_roomRepository != null && roomIds.Count > 0)
        {
            var targetIds = roomIds.ToHashSet();
            var rooms = await _roomRepository.Query(r => r.ClinicId == _clinicContext.ClinicId && targetIds.Contains(r.Id))
                .ToListAsync(cancellationToken);
            var roomMap = rooms.ToDictionary(r => r.Id, r => r.Name);
            roomNames = roomIds.Where(id => roomMap.ContainsKey(id)).Select(id => roomMap[id]).ToList();
        }

        return new StaffMemberDto(
            staff.Id,
            staff.TenantId,
            staff.ClinicId,
            staff.ClinicRoleId,
            staff.ClinicRole?.Name,
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
            staff.CreatedAt,
            HasCredentials: !string.IsNullOrEmpty(staff.PasswordHash),
            MustChangePassword: staff.MustChangePassword,
            PhilHealthPan: staff.PhilHealthPan,
            AssignedRoomIds: roomIds,
            AssignedRoomNames: roomNames);
    }
}
