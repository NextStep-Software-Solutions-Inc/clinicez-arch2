namespace ClinicEz.Clinic.Application.Features.Audit.Queries;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Audit.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

public sealed record GetAuditLogsQuery(
    string? Category = null,
    string? Severity = null,
    string? Action = null,
    Guid? ActorId = null,
    string? EntityId = null,
    string? Search = null,
    DateTime? StartDate = null,
    DateTime? EndDate = null,
    string? Before = null,
    int PageSize = 50) : IRequest<AuditLogListDto>;

public sealed class GetAuditLogsQueryValidator : AbstractValidator<GetAuditLogsQuery>
{
    public GetAuditLogsQueryValidator()
    {
        RuleFor(x => x.PageSize)
            .InclusiveBetween(1, 100)
            .WithMessage("Page size must be between 1 and 100.");

        When(x => x.StartDate.HasValue && x.EndDate.HasValue, () =>
        {
            RuleFor(x => x.StartDate!.Value)
                .LessThanOrEqualTo(x => x.EndDate!.Value)
                .WithMessage("StartDate must be earlier than or equal to EndDate.");
        });
    }
}

public sealed class GetAuditLogsQueryHandler : IRequestHandler<GetAuditLogsQuery, AuditLogListDto>
{
    private readonly IRepository<AuditEntry> _auditRepo;

    public GetAuditLogsQueryHandler(IRepository<AuditEntry> auditRepo)
    {
        _auditRepo = auditRepo ?? throw new ArgumentNullException(nameof(auditRepo));
    }

    public async Task<AuditLogListDto> Handle(GetAuditLogsQuery request, CancellationToken cancellationToken)
    {
        IQueryable<AuditEntry> query = _auditRepo.Query().AsNoTracking();

        // 1. Filter by Category
        if (!string.IsNullOrWhiteSpace(request.Category) && !string.Equals(request.Category, "All", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(e => e.Category == request.Category.Trim());
        }

        // 2. Filter by Severity
        if (!string.IsNullOrWhiteSpace(request.Severity) && !string.Equals(request.Severity, "All", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(e => e.Severity == request.Severity.Trim());
        }

        // 3. Filter by Action Key
        if (!string.IsNullOrWhiteSpace(request.Action))
        {
            query = query.Where(e => e.Action == request.Action.Trim());
        }

        // 4. Filter by Actor Staff ID
        if (request.ActorId.HasValue)
        {
            query = query.Where(e => e.ActorStaffId == request.ActorId.Value);
        }

        // 5. Filter by Target Entity ID
        if (!string.IsNullOrWhiteSpace(request.EntityId))
        {
            query = query.Where(e => e.TargetEntityId == request.EntityId.Trim());
        }

        // 6. Filter by Date Range (UTC)
        if (request.StartDate.HasValue)
        {
            var startUtc = DateTime.SpecifyKind(request.StartDate.Value, DateTimeKind.Utc);
            query = query.Where(e => e.Timestamp >= startUtc);
        }

        if (request.EndDate.HasValue)
        {
            var endUtc = DateTime.SpecifyKind(request.EndDate.Value, DateTimeKind.Utc);
            query = query.Where(e => e.Timestamp <= endUtc);
        }

        // 7. Free-Text Search across Actor, Action, Description, Entity, and Masked Patient
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLower();
            query = query.Where(e =>
                e.ActorName.ToLower().Contains(term) ||
                e.Action.ToLower().Contains(term) ||
                e.Description.ToLower().Contains(term) ||
                e.TargetEntityType.ToLower().Contains(term) ||
                (e.TargetEntityId != null && e.TargetEntityId.ToLower().Contains(term)) ||
                (e.PatientNameMasked != null && e.PatientNameMasked.ToLower().Contains(term)) ||
                (e.PatientPinMasked != null && e.PatientPinMasked.ToLower().Contains(term)));
        }

        // 8. Backward Cursor Pagination using Before timestamp
        if (!string.IsNullOrWhiteSpace(request.Before))
        {
            if (DateTime.TryParse(request.Before, null, System.Globalization.DateTimeStyles.RoundtripKind, out var parsedCursor))
            {
                var cursorUtc = DateTime.SpecifyKind(parsedCursor, DateTimeKind.Utc);
                query = query.Where(e => e.Timestamp < cursorUtc);
            }
        }

        var pageSize = Math.Clamp(request.PageSize, 1, 100);

        // Order by indexed (ClinicId, Timestamp DESC)
        var entries = await query
            .OrderByDescending(e => e.Timestamp)
            .ThenByDescending(e => e.Id)
            .Take(pageSize + 1)
            .ToListAsync(cancellationToken);

        bool hasMore = entries.Count > pageSize;
        var pageItems = hasMore ? entries.Take(pageSize).ToList() : entries;

        string? nextCursor = hasMore && pageItems.Count > 0
            ? pageItems[^1].Timestamp.ToUniversalTime().ToString("o")
            : null;

        var dtos = pageItems.Select(MapToDto).ToList().AsReadOnly();

        return new AuditLogListDto(
            Items: dtos,
            HasMore: hasMore,
            NextCursor: nextCursor,
            TotalCount: dtos.Count);
    }

    public static ClinicAuditEntryDto MapToDto(AuditEntry entry) => new(
        Id: entry.Id,
        TenantId: entry.TenantId,
        ClinicId: entry.ClinicId,
        Timestamp: entry.Timestamp,
        Category: entry.Category,
        Severity: entry.Severity,
        Action: entry.Action,
        ActorStaffId: entry.ActorStaffId,
        ActorName: entry.ActorName,
        ActorRole: entry.ActorRole,
        ClientIpAddress: entry.ClientIpAddress,
        UserAgent: entry.UserAgent,
        TargetEntityType: entry.TargetEntityType,
        TargetEntityId: entry.TargetEntityId,
        PatientId: entry.PatientId,
        PatientNameMasked: entry.PatientNameMasked,
        PatientPinMasked: entry.PatientPinMasked,
        Outcome: entry.Outcome,
        Description: entry.Description,
        MetadataJson: entry.MetadataJson ?? "{}",
        CreatedAt: entry.CreatedAt);
}
