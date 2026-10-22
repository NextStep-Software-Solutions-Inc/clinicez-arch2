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
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Staff.Queries;

public sealed record GetStaffMembersQuery(StaffRole? Role = null, bool? IsActive = null) : IRequest<IReadOnlyList<StaffMemberDto>>;

public sealed class GetStaffMembersQueryHandler : IRequestHandler<GetStaffMembersQuery, IReadOnlyList<StaffMemberDto>>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<ClinicRoom>? _roomRepository;

    public GetStaffMembersQueryHandler(
        IRepository<StaffMember> staffRepository,
        IClinicContext clinicContext,
        IRepository<ClinicRoom>? roomRepository = null)
    {
        _staffRepository = staffRepository;
        _clinicContext = clinicContext;
        _roomRepository = roomRepository;
    }

    public async Task<IReadOnlyList<StaffMemberDto>> Handle(GetStaffMembersQuery request, CancellationToken cancellationToken)
    {
        var query = _staffRepository.Query(s => s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .AsQueryable();

        if (request.Role.HasValue)
        {
            query = query.Where(s => s.Role == request.Role.Value);
        }

        if (request.IsActive.HasValue)
        {
            query = query.Where(s => s.IsActive == request.IsActive.Value);
        }

        var list = await query
            .OrderBy(s => s.LastName)
            .ThenBy(s => s.FirstName)
            .ToListAsync(cancellationToken);

        Dictionary<Guid, string> roomMap = new();
        if (_roomRepository != null)
        {
            var rooms = await _roomRepository.Query(r => r.ClinicId == _clinicContext.ClinicId)
                .ToListAsync(cancellationToken);
            roomMap = rooms.ToDictionary(r => r.Id, r => r.Name);
        }

        return list.Select(staff =>
        {
            var roomIds = staff.GetAssignedRoomIds();
            var roomNames = roomIds.Where(id => roomMap.ContainsKey(id)).Select(id => roomMap[id]).ToList();

            var effectiveStatus = staff.Status;
            // Healing fallback: Accounts with established credentials or lacking invitation tokens
            // are active clinical members (or suspended), never pending invitations.
            if (effectiveStatus == StaffAccountStatus.Invited && (!string.IsNullOrEmpty(staff.PasswordHash) || staff.InvitationToken == null))
            {
                effectiveStatus = staff.IsActive ? StaffAccountStatus.Active : StaffAccountStatus.Suspended;
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
                AssignedRoomNames: roomNames,
                SignatureSpecimen: staff.SignatureSpecimen,
                DefaultSignatureMode: staff.DefaultSignatureMode,
                Status: effectiveStatus,
                InvitationToken: staff.InvitationToken,
                InvitationExpiresAt: staff.InvitationExpiresAt,
                InviteAcceptedAt: staff.InviteAcceptedAt
            );
        }).ToList();
    }
}

public sealed record GetStaffMemberByIdQuery(Guid Id) : IRequest<StaffMemberDto>;

public sealed class GetStaffMemberByIdQueryHandler : IRequestHandler<GetStaffMemberByIdQuery, StaffMemberDto>
{
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<ClinicRoom>? _roomRepository;

    public GetStaffMemberByIdQueryHandler(
        IRepository<StaffMember> staffRepository,
        IClinicContext clinicContext,
        IRepository<ClinicRoom>? roomRepository = null)
    {
        _staffRepository = staffRepository;
        _clinicContext = clinicContext;
        _roomRepository = roomRepository;
    }

    public async Task<StaffMemberDto> Handle(GetStaffMemberByIdQuery request, CancellationToken cancellationToken)
    {
        var staff = await _staffRepository.Query(s => s.Id == request.Id && s.ClinicId == _clinicContext.ClinicId)
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(cancellationToken);

        if (staff == null)
        {
            throw new NotFoundException($"Staff member '{request.Id}' was not found in this clinic.");
        }

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

        var effectiveStatus = staff.Status;
        if (effectiveStatus == StaffAccountStatus.Invited && (!string.IsNullOrEmpty(staff.PasswordHash) || staff.InvitationToken == null))
        {
            effectiveStatus = staff.IsActive ? StaffAccountStatus.Active : StaffAccountStatus.Suspended;
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
            AssignedRoomNames: roomNames,
            SignatureSpecimen: staff.SignatureSpecimen,
            DefaultSignatureMode: staff.DefaultSignatureMode,
            Status: effectiveStatus,
            InvitationToken: staff.InvitationToken,
            InvitationExpiresAt: staff.InvitationExpiresAt,
            InviteAcceptedAt: staff.InviteAcceptedAt);
    }
}
