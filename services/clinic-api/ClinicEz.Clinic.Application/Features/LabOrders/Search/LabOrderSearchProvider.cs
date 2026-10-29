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

namespace ClinicEz.Clinic.Application.Features.LabOrders.Search;

/// <summary>
/// Pluggable search provider querying laboratory orders by order number, test name, panic flags, and patient name.
/// </summary>
public sealed class LabOrderSearchProvider : ISearchProvider
{
    private readonly IRepository<LabOrder> _labOrderRepo;

    public string Category => "LabOrders";
    public int Priority => 50;
    public string? RequiredPermission => ClinicPermissions.LabOrdersRead;

    public LabOrderSearchProvider(IRepository<LabOrder> labOrderRepo)
    {
        _labOrderRepo = labOrderRepo ?? throw new ArgumentNullException(nameof(labOrderRepo));
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

        var orders = await _labOrderRepo.Query(e => !e.IsDeleted && e.ClinicId == tenantId, ignoreQueryFilters: true)
            .Include(o => o.Items)
            .AsNoTracking()
            .Where(o =>
                o.OrderNumber.ToLower().Contains(term) ||
                o.PatientName.ToLower().Contains(term) ||
                (o.ClinicalDiagnosis != null && o.ClinicalDiagnosis.ToLower().Contains(term)) ||
                (o.OrderedByDoctorName != null && o.OrderedByDoctorName.ToLower().Contains(term)) ||
                o.Items.Any(i => i.TestName.ToLower().Contains(term)))
            .OrderByDescending(o => o.OrderDate)
            .Take(boundedLimit)
            .ToListAsync(ct);

        return orders.Select(o =>
        {
            var (badgeText, badgeVariant) = ResolveBadge(o);
            var testsSummary = o.Items.Count > 0
                ? string.Join(", ", o.Items.Select(i => i.TestName))
                : (o.ClinicalDiagnosis ?? "Routine Lab Panel");

            if (testsSummary.Length > 40)
            {
                testsSummary = testsSummary.Substring(0, 37) + "...";
            }

            return new SearchResultItemDto(
                id: o.Id.ToString(),
                category: Category,
                title: $"{o.OrderNumber} - {o.PatientName}",
                subtitle: $"{o.OrderDate:yyyy-MM-dd} • Tests: {testsSummary}",
                badgeText: badgeText,
                badgeVariant: badgeVariant,
                targetRoute: "LabOrders",
                routeParams: new Dictionary<string, string>
                {
                    { "orderId", o.Id.ToString() },
                    { "patientId", o.PatientId.ToString() }
                }
            );
        }).ToList();
    }

    private static (string text, string variant) ResolveBadge(LabOrder order)
    {
        if (order.HasCriticalPanicAlert)
            return ("PANIC", SearchBadgeVariant.Emergency);

        return order.Status switch
        {
            LabOrderStatus.Completed or LabOrderStatus.CompletedWithExternalReport => ("Completed", SearchBadgeVariant.Routine),
            LabOrderStatus.Ordered or LabOrderStatus.SpecimenCollected or LabOrderStatus.SentToLab or LabOrderStatus.ResultsReceived => ("Pending", SearchBadgeVariant.Urgent),
            _ => (order.Status.ToString(), SearchBadgeVariant.Neutral)
        };
    }
}
