using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Rooms.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Rooms.Queries;

public sealed record GetClinicRoomsQuery(bool ActiveOnly = false) : IRequest<IReadOnlyList<ClinicRoomDto>>;

public sealed class GetClinicRoomsQueryHandler : IRequestHandler<GetClinicRoomsQuery, IReadOnlyList<ClinicRoomDto>>
{
    private readonly IRepository<Room> _roomRepository;
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public GetClinicRoomsQueryHandler(
        IRepository<Room> roomRepository,
        IRepository<StaffMember> staffRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _roomRepository = roomRepository;
        _staffRepository = staffRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<IReadOnlyList<ClinicRoomDto>> Handle(GetClinicRoomsQuery request, CancellationToken cancellationToken)
    {
        var hasEverSeeded = await _roomRepository
            .Query(r => r.ClinicId == _clinicContext.ClinicId)
            .IgnoreQueryFilters()
            .AnyAsync(cancellationToken);

        if (!hasEverSeeded && _clinicContext.ClinicId != Guid.Empty && !string.IsNullOrWhiteSpace(_clinicContext.TenantId))
        {
            var now = DateTime.UtcNow;
            var actor = _clinicContext.StaffId?.ToString() ?? "SystemSeed";
            var defaults = new[]
            {
                new Room
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    Name = "Room 1",
                    Code = "RM-1",
                    Type = ClinicRoomType.Consultation,
                    Description = "Primary consultation room",
                    DisplayOrder = 1,
                    IsActive = true,
                    CreatedAt = now,
                    CreatedBy = actor
                },
                new Room
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    Name = "Room 2",
                    Code = "RM-2",
                    Type = ClinicRoomType.Consultation,
                    Description = "Secondary consultation room",
                    DisplayOrder = 2,
                    IsActive = true,
                    CreatedAt = now,
                    CreatedBy = actor
                },
                new Room
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    Name = "Triage Station",
                    Code = "TRG-1",
                    Type = ClinicRoomType.Triage,
                    Description = "Initial intake and vital signs assessment station",
                    DisplayOrder = 3,
                    IsActive = true,
                    CreatedAt = now,
                    CreatedBy = actor
                },
                new Room
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    Name = "Treatment Room",
                    Code = "TX-1",
                    Type = ClinicRoomType.Treatment,
                    Description = "Nursing procedures, nebulization, wound care, and immunizations",
                    DisplayOrder = 4,
                    IsActive = true,
                    CreatedAt = now,
                    CreatedBy = actor
                }
            };

            foreach (var room in defaults)
            {
                await _roomRepository.AddAsync(room, cancellationToken);
            }

            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        var query = _roomRepository.Query(r => r.ClinicId == _clinicContext.ClinicId);
        if (request.ActiveOnly)
        {
            query = query.Where(r => r.IsActive);
        }

        var rooms = await query
            .OrderBy(r => r.DisplayOrder)
            .ThenBy(r => r.Name)
            .ToListAsync(cancellationToken);

        var activeStaff = await _staffRepository
            .Query(s => s.ClinicId == _clinicContext.ClinicId && s.IsActive && s.AssignedRoomIdsJson != null)
            .OrderBy(s => s.FirstName)
            .ThenBy(s => s.LastName)
            .ToListAsync(cancellationToken);

        var staffByRoom = new Dictionary<Guid, List<(Guid Id, string Name)>>();
        foreach (var staff in activeStaff)
        {
            var fullName = string.IsNullOrWhiteSpace(staff.Title)
                ? $"{staff.FirstName} {staff.LastName}".Trim()
                : $"{staff.Title} {staff.FirstName} {staff.LastName}".Trim();

            foreach (var roomId in staff.GetAssignedRoomIds())
            {
                if (!staffByRoom.TryGetValue(roomId, out var list))
                {
                    list = new List<(Guid Id, string Name)>();
                    staffByRoom[roomId] = list;
                }
                list.Add((staff.Id, fullName));
            }
        }

        return rooms.Select(r =>
        {
            var assigned = staffByRoom.GetValueOrDefault(r.Id);
            var ids = (IReadOnlyList<Guid>)(assigned?.Select(x => x.Id).ToList() ?? (IList<Guid>)Array.Empty<Guid>());
            var names = (IReadOnlyList<string>)(assigned?.Select(x => x.Name).ToList() ?? (IList<string>)Array.Empty<string>());
            return new ClinicRoomDto(
                r.Id,
                r.TenantId,
                r.ClinicId,
                r.Name,
                r.Code,
                r.Type,
                r.Description,
                r.DisplayOrder,
                r.IsActive,
                ids.Count,
                r.CreatedAt,
                ids,
                names);
        }).ToList();
    }
}
