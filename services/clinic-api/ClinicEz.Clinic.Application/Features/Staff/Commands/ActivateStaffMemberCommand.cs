using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Licensing;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Clinic.Application.Features.Staff.Commands;

public sealed record ActivateStaffMemberCommand(Guid Id) : IRequest<StaffMemberDto>;

public sealed class ActivateStaffMemberCommandValidator : AbstractValidator<ActivateStaffMemberCommand>
{
    public ActivateStaffMemberCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public sealed class ActivateStaffMemberCommandHandler : IRequestHandler<ActivateStaffMemberCommand, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IRepository<ClinicSettings> _settingsRepository;
    private readonly IFacilityLicenseValidator _licenseValidator;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public ActivateStaffMemberCommandHandler(
        IRepository<StaffMember> staffRepository,
        IRepository<ClinicSettings> settingsRepository,
        IFacilityLicenseValidator licenseValidator,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _staffRepository = staffRepository;
        _settingsRepository = settingsRepository;
        _licenseValidator = licenseValidator;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<StaffMemberDto> Handle(ActivateStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepository.Query(s => s.Id == request.Id && s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.Id}' was not found in this clinic.");
        }

        if (staff.IsActive)
        {
            return MapToDto(staff);
        }

        // Cryptographic License Validation & Tamper Verification
        var settings = await _settingsRepository.Query(s => s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        var licenseResult = _licenseValidator.Validate(settings?.LicenseToken, _clinicContext.ClinicId, _clinicContext.TenantId);

        if (licenseResult.IsMissing)
        {
            throw new ValidationException("Facility activation required: No valid license key is installed for this clinic. Please apply an authorized license key to activate staff.");
        }

        if (licenseResult.IsTampered)
        {
            throw new ValidationException($"Tampered facility license detected: {licenseResult.ErrorMessage}. Staff activation is locked.");
        }

        if (licenseResult.IsExpired)
        {
            throw new ValidationException("Facility license has expired. The clinic is operating in Grace Read-Only mode. Staff management is locked.");
        }

        int maxStaffLimit = licenseResult.Payload?.Limits?.MaxStaff ?? 5;
        int currentActiveStaff = await _staffRepository.Query(s => s.ClinicId == _clinicContext.ClinicId && s.IsActive)
            .CountAsync(cancellationToken);

        if (currentActiveStaff >= maxStaffLimit)
        {
            throw new ValidationException($"Staff limit reached: Your facility license allows up to {maxStaffLimit} active staff members ({currentActiveStaff} currently active). Please upgrade your facility license to activate more staff.");
        }

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            staff.IsActive = true;
            staff.UpdatedAt = DateTime.UtcNow;
            staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";

            _staffRepository.Update(staff);
        }, cancellationToken);

        return MapToDto(staff);
    }

    private static StaffMemberDto MapToDto(StaffMember staff) =>
        new(
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
            PhilHealthPan: staff.PhilHealthPan
        );
}
