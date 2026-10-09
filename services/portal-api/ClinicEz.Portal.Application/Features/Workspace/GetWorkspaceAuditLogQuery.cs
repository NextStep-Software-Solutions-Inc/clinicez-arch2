using ClinicEz.Portal.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

public record WorkspaceAuditEntryDto(
    Guid Id,
    DateTime OccurredAt,
    string ActorName,
    string ActorRole,
    string Section,
    string Action,
    JsonElement Changes);

/// <summary><paramref name="NextCursor"/> is the <c>before</c> value for the next page, or null at the end.</summary>
public record WorkspaceAuditLogPageDto(IReadOnlyList<WorkspaceAuditEntryDto> Items, DateTime? NextCursor);

/// <summary>Newest-first page of the workspace audit trail. <paramref name="Before"/> pages backwards in time.</summary>
public record GetWorkspaceAuditLogQuery(string TenantSlug, int Take = 25, DateTime? Before = null, string? Section = null)
    : IRequest<WorkspaceAuditLogPageDto?>;

public class GetWorkspaceAuditLogQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetWorkspaceAuditLogQuery, WorkspaceAuditLogPageDto?>
{
    public const int MaxTake = 100;

    public async Task<WorkspaceAuditLogPageDto?> Handle(GetWorkspaceAuditLogQuery request, CancellationToken cancellationToken)
    {
        var key = request.TenantSlug.Trim().ToLowerInvariant();
        var tenantId = await context.Tenants
            .AsNoTracking()
            .Where(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key)
            .Select(t => (Guid?)t.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (tenantId is null) return null;

        var take = Math.Clamp(request.Take, 1, MaxTake);

        var query = context.WorkspaceAuditEntries.AsNoTracking().Where(e => e.TenantId == tenantId);
        if (request.Before is { } before) query = query.Where(e => e.CreatedAt < before);
        if (!string.IsNullOrWhiteSpace(request.Section))
        {
            var section = request.Section.Trim().ToLowerInvariant();
            query = query.Where(e => e.Section == section);
        }

        // One extra row tells us whether another page exists.
        var rows = await query
            .OrderByDescending(e => e.CreatedAt)
            .ThenByDescending(e => e.Id)
            .Take(take + 1)
            .ToListAsync(cancellationToken);

        var page = rows.Take(take).ToList();
        DateTime? next = rows.Count > take ? page[^1].CreatedAt : null;

        return new WorkspaceAuditLogPageDto(page.Select(ToDto).ToList(), next);
    }

    private static WorkspaceAuditEntryDto ToDto(Domain.Entities.WorkspaceAuditEntry e) => new(
        e.Id, e.CreatedAt, e.ActorName, e.ActorRole, e.Section, e.Action, ParseChanges(e.ChangesJson));

    private static JsonElement ParseChanges(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
            return doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            using var empty = JsonDocument.Parse("{}");
            return empty.RootElement.Clone();
        }
    }
}
