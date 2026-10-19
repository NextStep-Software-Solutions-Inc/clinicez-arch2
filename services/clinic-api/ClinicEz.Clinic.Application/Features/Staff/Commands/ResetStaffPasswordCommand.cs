using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.LocalAuth;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Clinic.Application.Features.Staff.Commands;

public sealed record ResetStaffPasswordCommand(
    Guid StaffId,
    string? TemporaryPassword = null) : IRequest<ResetStaffPasswordResult>;

public sealed record ResetStaffPasswordResult(
    Guid StaffId,
    string StaffName,
    string Email,
    string TemporaryPassword,
    string Message);

public sealed class ResetStaffPasswordCommandValidator : AbstractValidator<ResetStaffPasswordCommand>
{
    public ResetStaffPasswordCommandValidator()
    {
        RuleFor(x => x.StaffId).NotEmpty();
        When(x => !string.IsNullOrEmpty(x.TemporaryPassword), () =>
        {
            RuleFor(x => x.TemporaryPassword)
                .MinimumLength(8)
                .WithMessage("Temporary password must be at least 8 characters.");
        });
    }
}

public sealed class ResetStaffPasswordCommandHandler : IRequestHandler<ResetStaffPasswordCommand, ResetStaffPasswordResult>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IFacilityPasswordHasher _passwordHasher;

    public ResetStaffPasswordCommandHandler(
        IRepository<StaffMember> staffRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IFacilityPasswordHasher? passwordHasher = null)
    {
        _staffRepository = staffRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _passwordHasher = passwordHasher ?? new FacilityPasswordHasher();
    }

    public async Task<ResetStaffPasswordResult> Handle(ResetStaffPasswordCommand request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepository.Query(s => s.Id == request.StaffId && s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.StaffId}' was not found in this clinic.");
        }

        if (string.IsNullOrWhiteSpace(staff.Email))
        {
            throw new ValidationException("Staff member must have a valid email address configured before login credentials can be reset.");
        }

        var tempPassword = request.TemporaryPassword;
        if (string.IsNullOrWhiteSpace(tempPassword))
        {
            // Auto-generate strong temporary password
            tempPassword = GenerateSecurePassword();
        }

        var problems = _passwordHasher.ValidateStrength(tempPassword, 8);
        if (problems.Count > 0)
        {
            throw new ValidationException($"Temporary password does not meet security requirements: {string.Join(" ", problems)}");
        }

        staff.PasswordHash = _passwordHasher.Hash(tempPassword);
        staff.MustChangePassword = true;
        staff.FailedLoginCount = 0;
        staff.LockoutEnd = null;
        staff.TokenVersion++;
        staff.UpdatedAt = DateTime.UtcNow;
        staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";

        _staffRepository.Update(staff);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var staffFullName = $"{staff.FirstName} {staff.LastName}".Trim();

        return new ResetStaffPasswordResult(
            staff.Id,
            staffFullName,
            staff.Email,
            tempPassword,
            "Temporary login password generated. The staff member must change this password upon their next login.");
    }

    private static string GenerateSecurePassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghijkmnopqrstuvwxyz";
        const string digits = "23456789";
        const string specials = "#!@$%";

        var sb = new StringBuilder();
        sb.Append(upper[RandomNumberGenerator.GetInt32(upper.Length)]);
        sb.Append(lower[RandomNumberGenerator.GetInt32(lower.Length)]);
        sb.Append(digits[RandomNumberGenerator.GetInt32(digits.Length)]);
        sb.Append(specials[RandomNumberGenerator.GetInt32(specials.Length)]);

        const string all = upper + lower + digits + specials;
        for (int i = 0; i < 6; i++)
        {
            sb.Append(all[RandomNumberGenerator.GetInt32(all.Length)]);
        }

        return sb.ToString();
    }
}
