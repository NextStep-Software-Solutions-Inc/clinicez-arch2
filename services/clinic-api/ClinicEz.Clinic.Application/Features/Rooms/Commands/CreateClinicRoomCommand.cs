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

public sealed record CreateClinicRoomCommand(
    string Name,
    string? Code,
    ClinicRoomType Type,
    string? Description = null,
    int? DisplayOrder = null,
    bool IsActive = true) : IRequest<ClinicRoomDto>;

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
    private readonly IRepository<ClinicRoom> _roomRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CreateClinicRoomCommandHandler(
        IRepository<ClinicRoom> roomRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _roomRepository = roomRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
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

        var room = new ClinicRoom
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
            0,
            room.CreatedAt);
    }
}
