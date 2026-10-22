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

namespace ClinicEz.Clinic.Application.Features.Billing.Search;

/// <summary>
/// Pluggable search provider querying billing records by invoice number, patient name, doctor, and line items.
/// </summary>
public sealed class BillingSearchProvider : ISearchProvider
{
    private readonly IRepository<Invoice> _invoiceRepo;

    public string Category => "Billing";
    public int Priority => 60;
    public string? RequiredPermission => ClinicPermissions.BillingRead;

    public BillingSearchProvider(IRepository<Invoice> invoiceRepo)
    {
        _invoiceRepo = invoiceRepo ?? throw new ArgumentNullException(nameof(invoiceRepo));
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

        var isUnpaidStatusSearch = term is "unpaid" or "unsettled" or "balance" or "bal" or "due" or "draft" or "soa" or "open";
        var isPromissorySearch = term is "promissory" or "promi" or "defer" or "deferred";

        var invoices = await _invoiceRepo.Query(e => !e.IsDeleted && e.ClinicId == tenantId, ignoreQueryFilters: true)
            .Include(inv => inv.LineItems)
            .AsNoTracking()
            .Where(inv =>
                inv.InvoiceNumber.ToLower().Contains(term) ||
                inv.PatientName.ToLower().Contains(term) ||
                (inv.Notes != null && inv.Notes.ToLower().Contains(term)) ||
                (isUnpaidStatusSearch && inv.BalanceDue > 0 && inv.Status != InvoiceStatus.Paid && inv.Status != InvoiceStatus.Voided) ||
                (isPromissorySearch && inv.BalanceDue > 0 && (
                    (inv.Notes != null && (inv.Notes.ToLower().Contains("promissory") || inv.Notes.Contains("[PROMISSORY NOTE]"))) ||
                    inv.Status == InvoiceStatus.PartiallyPaid)) ||
                inv.LineItems.Any(li => (li.DoctorName != null && li.DoctorName.ToLower().Contains(term)) || li.Description.ToLower().Contains(term)))
            .OrderByDescending(inv => inv.InvoiceDate)
            .Take(boundedLimit)
            .ToListAsync(ct);

        return invoices.Select(inv =>
        {
            var (badgeText, badgeVariant) = ResolveBadge(inv);

            return new SearchResultItemDto(
                id: inv.Id.ToString(),
                category: Category,
                title: $"{inv.InvoiceNumber} - {inv.PatientName}",
                subtitle: $"{inv.InvoiceDate:yyyy-MM-dd} • Net: ₱{inv.NetAmount:N2} • Bal: ₱{inv.BalanceDue:N2}",
                badgeText: badgeText,
                badgeVariant: badgeVariant,
                targetRoute: "Billing",
                routeParams: new Dictionary<string, string>
                {
                    { "invoiceId", inv.Id.ToString() },
                    { "patientId", inv.PatientId.ToString() }
                }
            );
        }).ToList();
    }

    private static (string text, string variant) ResolveBadge(Invoice invoice)
    {
        if (invoice.Status == InvoiceStatus.Paid)
            return ("Paid", SearchBadgeVariant.Routine);

        if (invoice.BalanceDue > 0)
            return ($"Bal: ₱{invoice.BalanceDue:N0}", SearchBadgeVariant.Urgent);

        return (invoice.Status.ToString(), SearchBadgeVariant.Neutral);
    }
}
