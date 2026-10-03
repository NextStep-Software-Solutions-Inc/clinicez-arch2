using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Staff.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Licensing;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Laboratory.Application.Features.Staff.Commands;

public sealed record CreateLabStaffMemberCommand(
    string TenantId,
    Guid LaboratoryId,
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    LabStaffRole Role,
    string? Email,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? PtrNumber,
    string? Specialty) : IRequest<LabStaffMemberDto>;

public sealed class CreateLabStaffMemberCommandValidator : AbstractValidator<CreateLabStaffMemberCommand>
{
    public CreateLabStaffMemberCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Role).IsInEnum();

        // Philippine regulatory compliance: Pathologists and Medical Technologists require PRC License Number
        When(x => x.Role == LabStaffRole.Pathologist || x.Role == LabStaffRole.MedicalTechnologist, () =>
        {
            RuleFor(x => x.PrcLicenseNumber)
                .NotEmpty()
                .WithMessage("PRC License Number is mandatory for Pathologists and Medical Technologists.");
        });
    }
}

public sealed class CreateLabStaffMemberCommandHandler : IRequestHandler<CreateLabStaffMemberCommand, LabStaffMemberDto>
{
    private readonly IRepository<LabStaffMember> _staffRepo;
    private readonly IRepository<LabSettings> _settingsRepo;
    private readonly IFacilityLicenseValidator _licenseValidator;
    private readonly IUnitOfWork _unitOfWork;

    public CreateLabStaffMemberCommandHandler(
        IRepository<LabStaffMember> staffRepo,
        IRepository<LabSettings> settingsRepo,
        IFacilityLicenseValidator licenseValidator,
        IUnitOfWork unitOfWork)
    {
        _staffRepo = staffRepo;
        _settingsRepo = settingsRepo;
        _licenseValidator = licenseValidator;
        _unitOfWork = unitOfWork;
    }

    public async Task<LabStaffMemberDto> Handle(CreateLabStaffMemberCommand request, CancellationToken ct)
    {
        var settings = await _settingsRepo.FindAsync(s => s.LaboratoryId == request.LaboratoryId, ct);

        var licenseResult = _licenseValidator.Validate(settings?.LicenseToken, request.LaboratoryId, request.TenantId);

        if (licenseResult.IsMissing)
        {
            throw new ValidationException("Facility activation required: No valid license key is installed for this laboratory. Please apply an authorized license key to create staff.");
        }

        if (licenseResult.IsTampered)
        {
            throw new ValidationException($"Tampered facility license detected: {licenseResult.ErrorMessage}. Laboratory staff creation is locked.");
        }

        if (licenseResult.IsExpired)
        {
            throw new ValidationException("Facility license has expired. The laboratory is operating in Grace Read-Only mode. Staff management is locked.");
        }

        // Security Hardening: Derive MaxStaff limit strictly from the validated cryptographic payload!
        int maxStaffLimit = licenseResult.Payload?.Limits?.MaxStaff ?? 5;
        int currentActiveStaff = await _staffRepo.Query(s => s.LaboratoryId == request.LaboratoryId && s.IsActive)
            .CountAsync(ct);

        if (currentActiveStaff >= maxStaffLimit)
        {
            throw new ValidationException($"Staff limit reached: Your facility license allows up to {maxStaffLimit} active staff members ({currentActiveStaff} currently active). Please upgrade your facility license to add more staff.");
        }

        var staff = new LabStaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = request.TenantId,
            LaboratoryId = request.LaboratoryId,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            MiddleName = request.MiddleName?.Trim(),
            Title = request.Title?.Trim(),
            Role = request.Role,
            Email = request.Email?.Trim(),
            PhoneNumber = request.PhoneNumber?.Trim(),
            PrcLicenseNumber = request.PrcLicenseNumber?.Trim(),
            PtrNumber = request.PtrNumber?.Trim(),
            Specialty = request.Specialty?.Trim(),
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "LabAdmin"
        };

        await _staffRepo.AddAsync(staff, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new LabStaffMemberDto(
            staff.Id,
            staff.TenantId,
            staff.LaboratoryId,
            staff.FirstName,
            staff.LastName,
            staff.MiddleName,
            staff.Title,
            staff.Role,
            staff.Email,
            staff.PhoneNumber,
            staff.PrcLicenseNumber,
            staff.PtrNumber,
            staff.Specialty,
            staff.IsActive,
            staff.CreatedAt);
    }
}
