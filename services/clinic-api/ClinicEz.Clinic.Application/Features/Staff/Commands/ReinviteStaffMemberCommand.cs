using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Clinic.Application.Features.Staff.Commands;

public sealed record ReinviteStaffMemberCommand(Guid Id, bool SendInviteEmail = true) : IRequest<StaffMemberDto>;

public sealed class ReinviteStaffMemberCommandValidator : AbstractValidator<ReinviteStaffMemberCommand>
{
    public ReinviteStaffMemberCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public sealed class ReinviteStaffMemberCommandHandler : IRequestHandler<ReinviteStaffMemberCommand, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IRepository<ClinicSettings> _settingsRepository;
    private readonly IClinicStaffInvitationNotifier? _invitationNotifier;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<ClinicRoom>? _roomRepository;

    public ReinviteStaffMemberCommandHandler(
        IRepository<StaffMember> staffRepository,
        IRepository<ClinicSettings> settingsRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IClinicStaffInvitationNotifier? invitationNotifier = null,
        IRepository<ClinicRoom>? roomRepository = null)
    {
        _staffRepository = staffRepository;
        _settingsRepository = settingsRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _invitationNotifier = invitationNotifier;
        _roomRepository = roomRepository;
    }

    public async Task<StaffMemberDto> Handle(ReinviteStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepository.Query(s => s.Id == request.Id && s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.Id}' was not found in this clinic.");
        }

        if (staff.Status == StaffAccountStatus.Active && staff.IsActive)
        {
            throw new ValidationException("This staff member is already active in this clinic.");
        }

        if (string.IsNullOrWhiteSpace(staff.Email))
        {
            throw new ValidationException("Cannot send an invitation because this staff member does not have an email address configured.");
        }

        var newToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var now = DateTime.UtcNow;

        staff.InvitationToken = newToken;
        staff.InvitationExpiresAt = now.AddDays(7);
        staff.InviteAcceptedAt = null;
        staff.PasswordHash = null;
        staff.MustChangePassword = false;
        staff.Status = StaffAccountStatus.Invited;
        staff.IsActive = true;
        staff.TokenVersion++;
        staff.UpdatedAt = now;
        staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";

        var settings = await _settingsRepository.Query(s => s.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        var inviteUrl = _invitationNotifier?.BuildInviteUrl(newToken, settings?.TenantSlug, settings?.FacilitySlug);

        if (request.SendInviteEmail)
        {
            _invitationNotifier?.EnqueueInvitationEmail(
                _clinicContext.TenantId,
                _clinicContext.ClinicId,
                settings?.ClinicName ?? "Clinic EZ",
                settings?.TenantSlug,
                settings?.FacilitySlug,
                staff,
                newToken);
        }

        _staffRepository.Update(staff);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

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
            HasCredentials: false,
            MustChangePassword: false,
            TemporaryPassword: null,
            PhilHealthPan: staff.PhilHealthPan,
            AssignedRoomIds: roomIds,
            AssignedRoomNames: roomNames,
            SignatureSpecimen: staff.SignatureSpecimen,
            DefaultSignatureMode: staff.DefaultSignatureMode,
            Status: staff.Status,
            InvitationToken: staff.InvitationToken,
            InvitationExpiresAt: staff.InvitationExpiresAt,
            InviteAcceptedAt: staff.InviteAcceptedAt,
            InviteUrl: inviteUrl);
    }
}
