using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Rooms.Commands;

public sealed record DeleteClinicRoomCommand(Guid Id) : IRequest<bool>;

public sealed class DeleteClinicRoomCommandHandler : IRequestHandler<DeleteClinicRoomCommand, bool>
{
    private readonly IRepository<ClinicRoom> _roomRepository;
    private readonly IRepository<StaffMember> _staffRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public DeleteClinicRoomCommandHandler(
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

    public async Task<bool> Handle(DeleteClinicRoomCommand request, CancellationToken cancellationToken)
    {
        var room = await _roomRepository
            .Query(r => r.Id == request.Id && r.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (room == null)
        {
            throw new NotFoundException($"Clinic room '{request.Id}' was not found.");
        }

        // Remove this room from any staff members referencing it before soft-deleting
        var assignedStaff = await _staffRepository
            .Query(s => s.ClinicId == _clinicContext.ClinicId && s.AssignedRoomIdsJson != null)
            .ToListAsync(cancellationToken);

        foreach (var staff in assignedStaff)
        {
            var currentRooms = staff.GetAssignedRoomIds().ToHashSet();
            if (currentRooms.Remove(room.Id))
            {
                staff.SetAssignedRoomIds(currentRooms);
                staff.UpdatedAt = DateTime.UtcNow;
                staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";
                _staffRepository.Update(staff);
            }
        }

        room.IsDeleted = true;
        room.IsActive = false;
        room.UpdatedAt = DateTime.UtcNow;
        room.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";
        _roomRepository.Update(room);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return true;
    }
}
