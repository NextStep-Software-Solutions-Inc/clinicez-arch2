using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Billing.Domain.Services;

/// <summary>
/// Groups invoices into visit bills: all invoices of the same tenant + branch + visit key + currency + patient are collected
/// at one counter as ONE bill, whichever facility issued them. A clinic-only tenant simply has one invoice per bill.
/// Invoices without a visit key are never merged.
/// </summary>
public static class VisitBillGrouper
{
    public static List<List<Invoice>> Group(IEnumerable<Invoice> invoices)
    {
        var groups = new List<List<Invoice>>();

        foreach (var visit in invoices.GroupBy(i => (i.TenantId, Branch: Normalize(i.BranchId), Visit: NormalizeVisit(i.VisitKey), i.Currency)))
        {
            if (visit.Key.Visit is null)
            {
                groups.AddRange(visit.Select(i => new List<Invoice> { i }));
                continue;
            }

            var byPatientId = new Dictionary<Guid, List<Invoice>>();
            var withoutId = new List<Invoice>();
            foreach (var invoice in visit)
            {
                if (invoice.PatientId is { } id)
                {
                    if (!byPatientId.TryGetValue(id, out var cluster)) byPatientId[id] = cluster = new List<Invoice>();
                    cluster.Add(invoice);
                }
                else
                {
                    withoutId.Add(invoice);
                }
            }

            var clusters = byPatientId.Values.ToList();
            var nameOnly = new Dictionary<string, List<Invoice>>();
            foreach (var invoice in withoutId)
            {
                var name = Normalize(invoice.PatientName) ?? string.Empty;
                var matches = clusters.Where(c => c.Any(i => Normalize(i.PatientName) == name)).ToList();
                if (matches.Count == 1)
                {
                    matches[0].Add(invoice);
                }
                else if (matches.Count == 0)
                {
                    if (!nameOnly.TryGetValue(name, out var cluster)) nameOnly[name] = cluster = new List<Invoice>();
                    cluster.Add(invoice);
                }
                else
                {
                    // Two different patients share this name in the same visit: never guess, keep it on its own bill.
                    clusters.Add(new List<Invoice> { invoice });
                }
            }

            clusters.AddRange(nameOnly.Values);
            groups.AddRange(clusters);
        }

        foreach (var group in groups) group.Sort(ByAge);
        groups.Sort((a, b) => ByAge(a[0], b[0]));
        return groups;
    }

    public static int ByAge(Invoice a, Invoice b)
    {
        var byTime = a.CreatedAtUtc.CompareTo(b.CreatedAtUtc);
        return byTime != 0 ? byTime : a.Id.CompareTo(b.Id);
    }

    private static string? Normalize(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed.ToLowerInvariant();
    }

    private static string? NormalizeVisit(string? value) => Normalize(value);
}

/// <summary>Splits one payment over the invoices of a visit.</summary>
public static class PaymentAllocator
{
    /// <summary>Oldest invoice first, each up to its balance. The amount may not exceed the combined balance.</summary>
    public static List<(Invoice Invoice, decimal Amount)> AllocateOldestFirst(IEnumerable<Invoice> visitInvoices, decimal amount)
    {
        var open = visitInvoices.Where(i => i.Balance > 0m).OrderBy(i => i, Comparer<Invoice>.Create(VisitBillGrouper.ByAge)).ToList();
        var totalBalance = open.Sum(i => i.Balance);
        if (amount < 0.01m || Money.Round(amount) != amount)
            throw new BadRequestException("A payment amount must be positive with at most two decimals.");
        if (amount > totalBalance)
            throw new BadRequestException($"The amount {amount:0.00} is more than the visit balance {totalBalance:0.00}.");

        var result = new List<(Invoice, decimal)>();
        var remaining = amount;
        foreach (var invoice in open)
        {
            if (remaining <= 0m) break;
            var share = Math.Min(invoice.Balance, remaining);
            result.Add((invoice, share));
            remaining -= share;
        }

        return result;
    }

    /// <summary>Caller-chosen amounts; must add up to the payment and each stay within its invoice balance.</summary>
    public static List<(Invoice Invoice, decimal Amount)> AllocateExplicit(
        IReadOnlyDictionary<Guid, Invoice> invoices, IReadOnlyList<(Guid InvoiceId, decimal Amount)> requested, decimal amount)
    {
        if (requested.Count == 0) throw new BadRequestException("Name at least one invoice to pay.");
        if (requested.Select(r => r.InvoiceId).Distinct().Count() != requested.Count)
            throw new BadRequestException("An invoice can appear only once in the allocations.");
        if (requested.Sum(r => r.Amount) != amount)
            throw new BadRequestException("The allocations must add up to the payment amount.");

        var result = new List<(Invoice, decimal)>();
        foreach (var (invoiceId, share) in requested)
        {
            if (!invoices.TryGetValue(invoiceId, out var invoice)) throw new NotFoundException($"Invoice {invoiceId} was not found.");
            if (share < 0.01m || Money.Round(share) != share)
                throw new BadRequestException("Each allocation must be positive with at most two decimals.");
            if (share > invoice.Balance)
                throw new BadRequestException($"The allocation {share:0.00} is more than the balance {invoice.Balance:0.00} of invoice {invoice.InvoiceNumber}.");
            result.Add((invoice, share));
        }

        return result;
    }
}
