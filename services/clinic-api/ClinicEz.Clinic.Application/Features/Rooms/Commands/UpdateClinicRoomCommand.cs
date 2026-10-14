using System;
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
    bool IsActive = true) : IRequest<ClinicRoomDto>;

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

        var assignedStaffCount = await _staffRepository
            .Query(s => s.ClinicId == _clinicContext.ClinicId && s.AssignedRoomId == room.Id)
            .CountAsync(cancellationToken);

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
            assignedStaffCount,
            room.CreatedAt);
    }
}
