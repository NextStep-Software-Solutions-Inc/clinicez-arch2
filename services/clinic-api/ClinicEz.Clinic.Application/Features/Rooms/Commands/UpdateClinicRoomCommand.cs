using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Rooms.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Rooms.Commands;

public sealed record UpdateClinicRoomCommand(
    Guid Id,
    string Name,
    string? Code,
    ClinicRoomType Type,
    string? Description = null,
    int? DisplayOrder = null,
    bool IsActive = true,
    IReadOnlyList<Guid>? AssignedStaffIds = null) : IRequest<ClinicRoomDto>;

public sealed class UpdateClinicRoomCommandValidator : AbstractValidator<UpdateClinicRoomCommand>
{
    public UpdateClinicRoomCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Code).MaximumLength(30);
        RuleFor(x => x.Description).MaximumLength(255);
        RuleFor(x => x.Type).IsInEnum();
    }
}

public sealed class UpdateClinicRoomCommandHandler : IRequestHandler<UpdateClinicRoomCommand, ClinicRoomDto>
{
    private readonly IRepository<ClinicRoom> _roomRepository;
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpdateClinicRoomCommandHandler(
        IRepository<ClinicRoom> roomRepository,
        IRepository<StaffMember> staffRepository,
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _roomRepository = roomRepository;
        _staffRepository = staffRepository;
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<ClinicRoomDto> Handle(UpdateClinicRoomCommand request, CancellationToken cancellationToken)
    {
        var room = await _roomRepository
            .Query(r => r.Id == request.Id && r.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (room == null)
        {
            throw new NotFoundException($"Clinic room '{request.Id}' was not found.");
        }

        var normalizedName = request.Name.Trim();
        var duplicate = await _roomRepository
            .Query(r => r.ClinicId == _clinicContext.ClinicId && r.Id != request.Id && r.Name.ToLower() == normalizedName.ToLower())
            .FirstOrDefaultAsync(cancellationToken);

        if (duplicate != null)
        {
            throw new ConflictException($"Another room or station named '{normalizedName}' already exists in this clinic.");
        }

        var previousName = room.Name;
        room.Name = normalizedName;
        room.Code = string.IsNullOrWhiteSpace(request.Code) ? null : request.Code.Trim();
        room.Type = request.Type;
        room.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        if (request.DisplayOrder.HasValue)
        {
            room.DisplayOrder = request.DisplayOrder.Value;
        }
        room.IsActive = request.IsActive;
        room.UpdatedAt = DateTime.UtcNow;
        room.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";

        _roomRepository.Update(room);

        // Synchronize staff assignments when AssignedStaffIds is provided
        if (request.AssignedStaffIds != null)
        {
            var desiredIds = request.AssignedStaffIds.Distinct().ToHashSet();
            var relevantStaff = await _staffRepository
                .Query(s => s.ClinicId == _clinicContext.ClinicId &&
                            (s.AssignedRoomId == room.Id || desiredIds.Contains(s.Id)))
                .ToListAsync(cancellationToken);

            foreach (var staff in relevantStaff)
            {
                if (desiredIds.Contains(staff.Id) && (staff.Role == StaffRole.Doctor || staff.Role == StaffRole.Nurse))
                {
                    if (staff.AssignedRoomId != room.Id)
                    {
                        staff.AssignedRoomId = room.Id;
                        staff.UpdatedAt = DateTime.UtcNow;
                        staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";
                        _staffRepository.Update(staff);
                    }
                }
                else if (staff.AssignedRoomId == room.Id && !desiredIds.Contains(staff.Id))
                {
                    staff.AssignedRoomId = null;
                    staff.UpdatedAt = DateTime.UtcNow;
                    staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";
                    _staffRepository.Update(staff);
                }
            }
        }

        // Synchronize active queue items referencing this room (by RoomId or legacy RoomOrStation name)
        if (!string.Equals(previousName, normalizedName, StringComparison.Ordinal))
        {
            var activeQueueItems = await _queueRepository
                .Query(q => q.ClinicId == _clinicContext.ClinicId &&
                            q.Status != QueueStatus.Completed &&
                            q.Status != QueueStatus.Cancelled &&
                            q.Status != QueueStatus.NoShow &&
                            (q.RoomId == room.Id || q.RoomOrStation == previousName))
                .ToListAsync(cancellationToken);

            foreach (var item in activeQueueItems)
            {
                item.RoomId = room.Id;
                item.RoomOrStation = normalizedName;
                _queueRepository.Update(item);
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var assignedStaff = await _staffRepository
            .Query(s => s.ClinicId == _clinicContext.ClinicId && s.AssignedRoomId == room.Id && s.IsActive)
            .OrderBy(s => s.FirstName)
            .ThenBy(s => s.LastName)
            .ToListAsync(cancellationToken);

        var assignedIds = assignedStaff.Select(s => s.Id).ToList();
        var assignedNames = assignedStaff
            .Select(s => string.IsNullOrWhiteSpace(s.Title)
                ? $"{s.FirstName} {s.LastName}".Trim()
                : $"{s.Title} {s.FirstName} {s.LastName}".Trim())
            .ToList();

        return new ClinicRoomDto(
            room.Id,
            room.TenantId,
            room.ClinicId,
            room.Name,
            room.Code,
            room.Type,
            room.Description,
            room.DisplayOrder,
            room.IsActive,
            assignedIds.Count,
            room.CreatedAt,
            assignedIds,
            assignedNames);
    }
}
