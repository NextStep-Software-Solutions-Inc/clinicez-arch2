using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Staff.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Licensing;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Pharmacy.Application.Features.Staff.Commands;

public sealed record CreatePharmacyStaffMemberCommand(
    string TenantId,
    Guid PharmacyId,
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    PharmacyStaffRole Role,
    string? Email,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? S2LicenseNumber) : IRequest<PharmacyStaffMemberDto>;

public sealed class CreatePharmacyStaffMemberCommandValidator : AbstractValidator<CreatePharmacyStaffMemberCommand>
{
    public CreatePharmacyStaffMemberCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Role).IsInEnum();

        // Philippine regulatory compliance: Chief Pharmacist and Staff Pharmacist require PRC License Number
        When(x => x.Role == PharmacyStaffRole.ChiefPharmacist || x.Role == PharmacyStaffRole.StaffPharmacist, () =>
        {
            RuleFor(x => x.PrcLicenseNumber)
                .NotEmpty()
                .WithMessage("PRC License Number is mandatory for Pharmacists.");
        });
    }
}

public sealed class CreatePharmacyStaffMemberCommandHandler : IRequestHandler<CreatePharmacyStaffMemberCommand, PharmacyStaffMemberDto>
{
    private readonly IRepository<PharmacyStaffMember> _staffRepo;
    private readonly IRepository<PharmacySettings> _settingsRepo;
    private readonly IFacilityLicenseValidator _licenseValidator;
    private readonly IUnitOfWork _unitOfWork;

    public CreatePharmacyStaffMemberCommandHandler(
        IRepository<PharmacyStaffMember> staffRepo,
        IRepository<PharmacySettings> settingsRepo,
        IFacilityLicenseValidator licenseValidator,
        IUnitOfWork unitOfWork)
    {
        _staffRepo = staffRepo;
        _settingsRepo = settingsRepo;
        _licenseValidator = licenseValidator;
        _unitOfWork = unitOfWork;
    }

    public async Task<PharmacyStaffMemberDto> Handle(CreatePharmacyStaffMemberCommand request, CancellationToken ct)
    {
        var settings = await _settingsRepo.FindAsync(s => s.PharmacyId == request.PharmacyId, ct);

        var licenseResult = _licenseValidator.Validate(settings?.LicenseToken, request.PharmacyId, request.TenantId);

        if (licenseResult.IsMissing)
        {
            throw new ValidationException("Facility activation required: No valid license key is installed for this pharmacy. Please apply an authorized license key to create staff.");
        }

        if (licenseResult.IsTampered)
        {
            throw new ValidationException($"Tampered facility license detected: {licenseResult.ErrorMessage}. Pharmacy staff creation is locked.");
        }

        if (licenseResult.IsExpired)
        {
            throw new ValidationException("Facility license has expired. The pharmacy is operating in Grace Read-Only mode. Staff management is locked.");
        }

        // Security Hardening: Derive MaxStaff limit strictly from the validated cryptographic payload!
        int maxStaffLimit = licenseResult.Payload?.Limits?.MaxStaff ?? 5;
        int currentActiveStaff = await _staffRepo.Query(s => s.PharmacyId == request.PharmacyId && s.IsActive)
            .CountAsync(ct);

        if (currentActiveStaff >= maxStaffLimit)
        {
            throw new ValidationException($"Staff limit reached: Your facility license allows up to {maxStaffLimit} active staff members ({currentActiveStaff} currently active). Please upgrade your facility license to add more staff.");
        }

        var staff = new PharmacyStaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = request.TenantId,
            PharmacyId = request.PharmacyId,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            MiddleName = request.MiddleName?.Trim(),
            Title = request.Title?.Trim(),
            Role = request.Role,
            Email = request.Email?.Trim(),
            PhoneNumber = request.PhoneNumber?.Trim(),
            PrcLicenseNumber = request.PrcLicenseNumber?.Trim(),
            S2LicenseNumber = request.S2LicenseNumber?.Trim(),
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "PharmacyAdmin"
        };

        await _staffRepo.AddAsync(staff, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new PharmacyStaffMemberDto(
            staff.Id,
            staff.TenantId,
            staff.PharmacyId,
            staff.FirstName,
            staff.LastName,
            staff.MiddleName,
            staff.Title,
            staff.Role,
            staff.Email,
            staff.PhoneNumber,
            staff.PrcLicenseNumber,
            staff.S2LicenseNumber,
            staff.IsActive,
            staff.CreatedAt);
    }
}
