using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Workspace;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

public sealed record ReconcileEodCommand(
    DateOnly? Date = null,
    string TriggerType = "Manual",
    string? Reason = null
) : IRequest<ReconcileEodResultDto>;

public sealed class ReconcileEodCommandHandler : IRequestHandler<ReconcileEodCommand, ReconcileEodResultDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IRepository<EodReconciliationAudit> _auditRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;

    public ReconcileEodCommandHandler(
        IRepository<QueueItem> queueRepository,
        IRepository<EodReconciliationAudit> auditRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null)
    {
        _queueRepository = queueRepository;
        _auditRepository = auditRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
    }

    public async Task<ReconcileEodResultDto> Handle(ReconcileEodCommand request, CancellationToken ct)
    {
        var targetDate = request.Date
            ?? await ClinicTimeZoneResolver.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, ct);
        var now = DateTime.UtcNow;

        // Fetch remaining active waiting tickets for the clinic and target date.
        // CRITICAL INVARIANT: Only Waiting, Triaged, and OnHold are transitioned.
        // InConsultation and Completed tickets MUST NOT be modified or invalidated!
        var activeItems = await _queueRepository.Query(q =>
            q.ClinicId == _clinicContext.ClinicId &&
            q.QueueDate == targetDate &&
            (q.Status == QueueStatus.Waiting || q.Status == QueueStatus.Triaged || q.Status == QueueStatus.OnHold))
            .OrderBy(q => q.SequenceNumber)
            .ToListAsync(ct);

        var affectedTickets = new List<string>();

        foreach (var item in activeItems)
        {
            item.Status = QueueStatus.NoShow;
            item.CompletedTime = now;
            item.UpdatedAt = now;
            item.UpdatedBy = request.TriggerType == "Automatic"
                ? "AutoEOD"
                : (_clinicContext.StaffId?.ToString() ?? "ClinicStaff");

            _queueRepository.Update(item);
            affectedTickets.Add(item.QueueNumber);
        }

        // Record Audit Trail
        var audit = new EodReconciliationAudit
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            ReconciliationDate = targetDate,
            ReconciledAt = now,
            TriggerType = request.TriggerType,
            ReconciledBy = request.TriggerType == "Automatic"
                ? "System / AutoEOD"
                : (_clinicContext.StaffId?.ToString() ?? "ClinicStaff"),
            StaffId = _clinicContext.StaffId,
            TotalTicketsProcessed = activeItems.Count,
            AffectedTicketNumbersJson = JsonSerializer.Serialize(affectedTickets),
            Notes = request.Reason ?? (request.TriggerType == "Automatic"
                ? "Scheduled EOD queue closure."
                : "Manual Force EOD triggered from workstation."),
            CreatedAt = now,
            CreatedBy = request.TriggerType == "Automatic" ? "AutoEOD" : "ClinicStaff"
        };

        await _auditRepository.AddAsync(audit, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        var summary = activeItems.Count > 0
            ? $"Successfully reconciled {activeItems.Count} leftover ticket(s) to No-Show for {targetDate:yyyy-MM-dd}."
            : $"No active tickets found for {targetDate:yyyy-MM-dd}; audit entry recorded.";

        return new ReconcileEodResultDto(
            activeItems.Count,
            targetDate,
            now,
            affectedTickets.AsReadOnly(),
            summary);
    }
}
