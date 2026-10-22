using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Auth.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Clinic.Application.Features.Auth.Queries;

public sealed record GetClinicInvitationDetailsQuery(string Token) : IRequest<ClinicStaffInvitationDetailsDto>;

public sealed class GetClinicInvitationDetailsQueryValidator : AbstractValidator<GetClinicInvitationDetailsQuery>
{
    public GetClinicInvitationDetailsQueryValidator()
    {
        RuleFor(x => x.Token).NotEmpty().WithMessage("Invitation token is required.");
    }
}

public sealed class GetClinicInvitationDetailsQueryHandler : IRequestHandler<GetClinicInvitationDetailsQuery, ClinicStaffInvitationDetailsDto>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IRepository<ClinicSettings> _settingsRepository;

    public GetClinicInvitationDetailsQueryHandler(
        IRepository<StaffMember> staffRepository,
        IRepository<ClinicSettings> settingsRepository)
    {
        _staffRepository = staffRepository;
        _settingsRepository = settingsRepository;
    }

    public async Task<ClinicStaffInvitationDetailsDto> Handle(GetClinicInvitationDetailsQuery request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new ValidationException("Invitation token cannot be empty.");
        }

        var staff = await _staffRepository.Query(s => s.InvitationToken == request.Token.Trim(), ignoreQueryFilters: true)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException("Invitation was not found or is invalid.");
        }

        var settings = await _settingsRepository.Query(s => s.ClinicId == staff.ClinicId, ignoreQueryFilters: true)
            .FirstOrDefaultAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var isExpired = (staff.Status == StaffAccountStatus.Invited || staff.MustChangePassword) && staff.InvitationExpiresAt.HasValue && staff.InvitationExpiresAt.Value < now;
        var isAlreadyAccepted = staff.Status == StaffAccountStatus.Active && !string.IsNullOrEmpty(staff.PasswordHash) && !staff.MustChangePassword;
        var isRevoked = staff.Status == StaffAccountStatus.Revoked;
        var isSuspended = staff.Status == StaffAccountStatus.Suspended;

        return new ClinicStaffInvitationDetailsDto(
            staff.Id,
            settings?.ClinicName ?? "Clinic EZ",
            settings?.FacilitySlug ?? settings?.TenantSlug ?? staff.TenantId,
            $"{staff.FirstName} {staff.LastName}".Trim(),
            staff.Email ?? "",
            staff.ClinicRole?.Name ?? staff.Role.ToString(),
            isExpired,
            isAlreadyAccepted,
            staff.InvitationExpiresAt,
            isRevoked,
            isSuspended
        );
    }
}
