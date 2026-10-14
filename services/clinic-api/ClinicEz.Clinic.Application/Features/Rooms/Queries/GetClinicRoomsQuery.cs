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
    private readonly IRepository<ClinicRoom> _roomRepository;
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public GetClinicRoomsQueryHandler(
        IRepository<ClinicRoom> roomRepository,
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
                new ClinicRoom
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
                new ClinicRoom
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
                new ClinicRoom
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
                new ClinicRoom
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

        var staffCounts = await _staffRepository
            .Query(s => s.ClinicId == _clinicContext.ClinicId && s.AssignedRoomId != null)
            .GroupBy(s => s.AssignedRoomId!.Value)
            .Select(g => new { RoomId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.RoomId, x => x.Count, cancellationToken);

        return rooms.Select(r => new ClinicRoomDto(
            r.Id,
            r.TenantId,
            r.ClinicId,
            r.Name,
            r.Code,
            r.Type,
            r.Description,
            r.DisplayOrder,
            r.IsActive,
            staffCounts.GetValueOrDefault(r.Id, 0),
            r.CreatedAt)).ToList();
    }
}
