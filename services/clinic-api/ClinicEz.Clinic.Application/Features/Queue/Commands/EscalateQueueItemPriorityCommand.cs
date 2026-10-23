using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

public sealed record EscalateQueueItemPriorityCommand(
    Guid QueueItemId,
    QueuePriority NewPriority,
    string EscalationReason
) : IRequest<QueueItemDto>;

public sealed class EscalateQueueItemPriorityCommandValidator : AbstractValidator<EscalateQueueItemPriorityCommand>
{
    public EscalateQueueItemPriorityCommandValidator()
    {
        RuleFor(x => x.QueueItemId).NotEmpty();
        RuleFor(x => x.NewPriority).IsInEnum();
        RuleFor(x => x.EscalationReason).NotEmpty().MaximumLength(500);
    }
}

public sealed class EscalateQueueItemPriorityCommandHandler : IRequestHandler<EscalateQueueItemPriorityCommand, QueueItemDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public EscalateQueueItemPriorityCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<QueueItemDto> Handle(EscalateQueueItemPriorityCommand request, CancellationToken ct)
    {
        var item = await _queueRepository.Query(q => q.Id == request.QueueItemId && q.ClinicId == _clinicContext.ClinicId)
            .Include(q => q.TriageVitals)
            .FirstOrDefaultAsync(ct);

        if (item == null)
        {
            throw new NotFoundException($"Queue item '{request.QueueItemId}' not found.");
        }

        var now = DateTime.UtcNow;
        var staff = _clinicContext.StaffId?.ToString() ?? "Staff";

        item.Priority = request.NewPriority;
        item.UpdatedAt = now;
        item.UpdatedBy = staff;

        if (item.TriageVitals != null && !string.IsNullOrWhiteSpace(request.EscalationReason))
        {
            item.TriageVitals.TriageAcuityReason = request.EscalationReason.Trim();
            item.TriageVitals.UpdatedAt = now;
            item.TriageVitals.UpdatedBy = staff;
        }

        _queueRepository.Update(item);
        await _unitOfWork.SaveChangesAsync(ct);

        return item.ToDto();
    }
}
