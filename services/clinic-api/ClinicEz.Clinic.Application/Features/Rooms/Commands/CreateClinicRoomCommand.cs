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

public sealed record CreateClinicRoomCommand(
    string Name,
    string? Code,
    ClinicRoomType Type,
    string? Description = null,
    int? DisplayOrder = null,
    bool IsActive = true,
    IReadOnlyList<Guid>? AssignedStaffIds = null) : IRequest<ClinicRoomDto>;

public sealed class CreateClinicRoomCommandValidator : AbstractValidator<CreateClinicRoomCommand>
{
    public CreateClinicRoomCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Code).MaximumLength(30);
        RuleFor(x => x.Description).MaximumLength(255);
        RuleFor(x => x.Type).IsInEnum();
    }
}

public sealed class CreateClinicRoomCommandHandler : IRequestHandler<CreateClinicRoomCommand, ClinicRoomDto>
{
    private readonly IRepository<Room> _roomRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<StaffMember>? _staffRepository;

    public CreateClinicRoomCommandHandler(
        IRepository<Room> roomRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<StaffMember>? staffRepository = null)
    {
        _roomRepository = roomRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _staffRepository = staffRepository;
    }

    public async Task<ClinicRoomDto> Handle(CreateClinicRoomCommand request, CancellationToken cancellationToken)
    {
        var normalizedName = request.Name.Trim();
        var existing = await _roomRepository
            .Query(r => r.ClinicId == _clinicContext.ClinicId && r.Name.ToLower() == normalizedName.ToLower())
            .FirstOrDefaultAsync(cancellationToken);

        if (existing != null)
        {
            throw new ConflictException($"A room or station named '{normalizedName}' already exists in this clinic.");
        }

        var nextOrder = request.DisplayOrder ?? (await _roomRepository
            .Query(r => r.ClinicId == _clinicContext.ClinicId)
            .Select(r => (int?)r.DisplayOrder)
            .MaxAsync(cancellationToken) ?? 0) + 1;

        var room = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            Name = normalizedName,
            Code = string.IsNullOrWhiteSpace(request.Code) ? null : request.Code.Trim(),
            Type = request.Type,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            DisplayOrder = nextOrder,
            IsActive = request.IsActive,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin"
        };

        await _roomRepository.AddAsync(room, cancellationToken);

        var assignedIds = new List<Guid>();
        var assignedNames = new List<string>();

        if (_staffRepository != null && request.AssignedStaffIds is { Count: > 0 })
        {
            var targetIds = request.AssignedStaffIds.Distinct().ToHashSet();
            var eligibleStaff = await _staffRepository
                .Query(s => s.ClinicId == _clinicContext.ClinicId &&
                            targetIds.Contains(s.Id) &&
                            (s.Role == StaffRole.Doctor || s.Role == StaffRole.Nurse))
                .ToListAsync(cancellationToken);

            foreach (var staff in eligibleStaff)
            {
                var currentRooms = staff.GetAssignedRoomIds().ToList();
                if (!currentRooms.Contains(room.Id))
                {
                    currentRooms.Add(room.Id);
                    staff.SetAssignedRoomIds(currentRooms);
                    staff.UpdatedAt = DateTime.UtcNow;
                    staff.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicAdmin";
                    _staffRepository.Update(staff);
                }
                assignedIds.Add(staff.Id);
                assignedNames.Add(string.IsNullOrWhiteSpace(staff.Title)
                    ? $"{staff.FirstName} {staff.LastName}".Trim()
                    : $"{staff.Title} {staff.FirstName} {staff.LastName}".Trim());
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

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
