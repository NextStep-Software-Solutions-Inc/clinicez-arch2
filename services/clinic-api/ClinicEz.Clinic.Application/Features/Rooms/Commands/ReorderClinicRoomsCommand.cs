using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Rooms.Commands;

public sealed record ReorderClinicRoomsCommand(IReadOnlyList<Guid> OrderedIds) : IRequest<bool>;

public sealed class ReorderClinicRoomsCommandValidator : AbstractValidator<ReorderClinicRoomsCommand>
{
    public ReorderClinicRoomsCommandValidator()
    {
        RuleFor(x => x.OrderedIds).NotEmpty();
    }
}

public sealed class ReorderClinicRoomsCommandHandler : IRequestHandler<ReorderClinicRoomsCommand, bool>
{
    private readonly IRepository<ClinicRoom> _roomRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public ReorderClinicRoomsCommandHandler(
        IRepository<ClinicRoom> roomRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _roomRepository = roomRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<bool> Handle(ReorderClinicRoomsCommand request, CancellationToken cancellationToken)
    {
        var rooms = await _roomRepository
            .Query(r => r.ClinicId == _clinicContext.ClinicId)
            .OrderBy(r => r.DisplayOrder)
            .ToListAsync(cancellationToken);

        if (rooms.Count == 0)
        {
            return true;
        }

        var roomLookup = rooms.ToDictionary(r => r.Id);
        var nextOrder = 1;

        foreach (var roomId in request.OrderedIds)
        {
            if (roomLookup.TryGetValue(roomId, out var room))
            {
                room.DisplayOrder = nextOrder++;
                room.UpdatedAt = DateTime.UtcNow;
                room.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";
                _roomRepository.Update(room);
                roomLookup.Remove(roomId);
            }
        }

        foreach (var remaining in roomLookup.Values.OrderBy(r => r.DisplayOrder))
        {
            remaining.DisplayOrder = nextOrder++;
            remaining.UpdatedAt = DateTime.UtcNow;
            remaining.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";
            _roomRepository.Update(remaining);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return true;
    }
}
