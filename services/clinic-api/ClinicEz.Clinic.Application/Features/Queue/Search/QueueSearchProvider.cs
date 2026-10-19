using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Search;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Search;

/// <summary>
/// Pluggable search provider querying OPD queue tickets by number, station, priority, and patient name.
/// </summary>
public sealed class QueueSearchProvider : ISearchProvider
{
    private readonly IRepository<QueueItem> _queueRepo;

    public string Category => "Queue";
    public int Priority => 40;
    public string? RequiredPermission => ClinicPermissions.QueueRead;

    public QueueSearchProvider(IRepository<QueueItem> queueRepo)
    {
        _queueRepo = queueRepo ?? throw new ArgumentNullException(nameof(queueRepo));
    }

    public async Task<IReadOnlyList<SearchResultItemDto>> SearchAsync(
        string query,
        Guid tenantId,
        int limit,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(query))
            return Array.Empty<SearchResultItemDto>();

        var term = query.Trim().ToLowerInvariant();
        var boundedLimit = limit <= 0 ? 10 : Math.Min(limit, 50);

        var items = await _queueRepo.Query(e => !e.IsDeleted && e.ClinicId == tenantId, ignoreQueryFilters: true)
            .AsNoTracking()
            .Where(q =>
                q.QueueNumber.ToLower().Contains(term) ||
                q.PatientName.ToLower().Contains(term) ||
                (q.DoctorName != null && q.DoctorName.ToLower().Contains(term)) ||
                (q.RoomOrStation != null && q.RoomOrStation.ToLower().Contains(term)) ||
                (q.ChiefComplaint != null && q.ChiefComplaint.ToLower().Contains(term)))
            .OrderByDescending(q => q.CheckInTime)
            .Take(boundedLimit)
            .ToListAsync(ct);

        return items.Select(q =>
        {
            var (badgeText, badgeVariant) = ResolveBadge(q);
            var doctorSnippet = string.IsNullOrWhiteSpace(q.DoctorName)
                ? string.Empty
                : " • " + q.DoctorName;

            return new SearchResultItemDto(
                id: q.Id.ToString(),
                category: Category,
                title: $"{q.QueueNumber}: {q.PatientName}",
                subtitle: $"{q.RoomOrStation ?? "Waiting Room"} • Status: {q.Status}{doctorSnippet}",
                badgeText: badgeText,
                badgeVariant: badgeVariant,
                targetRoute: "Queue",
                routeParams: new Dictionary<string, string>
                {
                    { "queueId", q.Id.ToString() }
                }
            );
        }).ToList();
    }

    private static (string text, string variant) ResolveBadge(QueueItem item) =>
        item.Priority switch
        {
            QueuePriority.Emergency => ("Emergency", SearchBadgeVariant.Emergency),
            QueuePriority.Urgent => ("Urgent", SearchBadgeVariant.Urgent),
            _ => (item.Status.ToString(), SearchBadgeVariant.Routine)
        };
}
