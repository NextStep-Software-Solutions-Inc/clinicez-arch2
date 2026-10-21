using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.LocalAuth;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Clinic.Application.Features.Auth.Commands;

public sealed record AcceptClinicStaffInvitationCommand(
    string Token,
    string Password,
    string? DeviceLabel = null
) : IRequest<StaffMemberDto>;

public sealed class AcceptClinicStaffInvitationCommandValidator : AbstractValidator<AcceptClinicStaffInvitationCommand>
{
    public AcceptClinicStaffInvitationCommandValidator()
    {
        RuleFor(x => x.Token).NotEmpty().WithMessage("Invitation token is required.");
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8).WithMessage("Password must be at least 8 characters.");
    }
}

public sealed class AcceptClinicStaffInvitationCommandHandler : IRequestHandler<AcceptClinicStaffInvitationCommand, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IFacilityPasswordHasher _passwordHasher;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IStaffAccessInvalidator? _accessCache;

    public AcceptClinicStaffInvitationCommandHandler(
        IRepository<StaffMember> staffRepository,
        IFacilityPasswordHasher passwordHasher,
        IUnitOfWork unitOfWork,
        IStaffAccessInvalidator? accessCache = null)
    {
        _staffRepository = staffRepository;
        _passwordHasher = passwordHasher;
        _unitOfWork = unitOfWork;
        _accessCache = accessCache;
    }

    public async Task<StaffMemberDto> Handle(AcceptClinicStaffInvitationCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new ValidationException("Invitation token is required.");
        }

        var staff = await _staffRepository.Query(s => s.InvitationToken == request.Token.Trim(), ignoreQueryFilters: true)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException("Invitation was not found or is invalid.");
        }

        if (staff.Status == StaffAccountStatus.Revoked)
        {
            throw new InvalidOperationException("This invitation has been revoked.");
        }

        if (staff.Status == StaffAccountStatus.Suspended)
        {
            throw new InvalidOperationException("This account is suspended.");
        }

        var now = DateTime.UtcNow;
        if (staff.InvitationExpiresAt.HasValue && staff.InvitationExpiresAt.Value < now)
        {
            throw new InvalidOperationException("This invitation has expired. Please ask your clinic administrator to resend the invitation.");
        }

        if (staff.Status == StaffAccountStatus.Active && !string.IsNullOrEmpty(staff.PasswordHash))
        {
            throw new InvalidOperationException("This invitation has already been accepted. Sign in instead.");
        }

        var problems = _passwordHasher.ValidateStrength(request.Password, 8);
        if (problems.Count > 0)
        {
            throw new ValidationException($"Password does not meet security requirements: {string.Join(" ", problems)}");
        }

        if (!string.IsNullOrWhiteSpace(staff.Email))
        {
            var normalizedEmail = staff.Email.Trim().ToLowerInvariant();
            var duplicate = await _staffRepository.Query(s =>
                s.Id != staff.Id &&
                s.ClinicId == staff.ClinicId &&
                s.Email != null &&
                s.Email.ToLower() == normalizedEmail &&
                s.PasswordHash != null,
                ignoreQueryFilters: true)
                .AnyAsync(cancellationToken);

            if (duplicate)
            {
                throw new ValidationException("Another staff member with this email already has sign-in credentials.");
            }
        }

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            staff.PasswordHash = _passwordHasher.Hash(request.Password);
            staff.MustChangePassword = false;
            staff.Status = StaffAccountStatus.Active;
            staff.IsActive = true;
            staff.InviteAcceptedAt = now;
            staff.FailedLoginCount = 0;
            staff.LockoutEnd = null;
            staff.LastLoginAt = now;
            staff.TokenVersion++;
            staff.UpdatedAt = now;
            staff.UpdatedBy = "System:InviteAccept";

            _staffRepository.Update(staff);
        }, cancellationToken);

        _accessCache?.Invalidate(staff.Id);

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
            HasCredentials: true,
            MustChangePassword: false,
            TemporaryPassword: null,
            PhilHealthPan: staff.PhilHealthPan,
            AssignedRoomIds: staff.GetAssignedRoomIds(),
            AssignedRoomNames: null,
            SignatureSpecimen: staff.SignatureSpecimen,
            DefaultSignatureMode: staff.DefaultSignatureMode,
            Status: staff.Status,
            InvitationToken: staff.InvitationToken,
            InvitationExpiresAt: staff.InvitationExpiresAt,
            InviteAcceptedAt: staff.InviteAcceptedAt,
            InviteUrl: null);
    }
}
