using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace ClinicEz.Portal.Application.Features.Billing.Services;

public interface IDocumentNumberGenerator
{
    Task<string> NextInvoiceNumberAsync(DateTime date, CancellationToken cancellationToken = default);
    Task<string> NextReceiptNumberAsync(DateTime date, CancellationToken cancellationToken = default);
}

public class DocumentNumberGenerator(IApplicationDbContext context) : IDocumentNumberGenerator
{
    private static readonly ConcurrentDictionary<string, int> _invoiceSequences = new();
    private static readonly ConcurrentDictionary<string, int> _receiptSequences = new();
    private static readonly SemaphoreSlim _invoiceGate = new(1, 1);
    private static readonly SemaphoreSlim _receiptGate = new(1, 1);

    public async Task<string> NextInvoiceNumberAsync(DateTime date, CancellationToken cancellationToken = default)
    {
        await _invoiceGate.WaitAsync(cancellationToken);
        try
        {
            var period = date.ToString("yyyyMM");
            var prefix = $"INV-{period}-";
            var dbScope = GetDatabaseScope(context);
            var key = $"{dbScope}:{prefix}";

            // 1. Query database for existing committed numbers ignoring soft-delete query filter
            var dbInvoices = await context.BillingInvoices
                .IgnoreQueryFilters()
                .Where(i => i.InvoiceNumber.StartsWith(prefix))
                .Select(i => i.InvoiceNumber)
                .ToListAsync(cancellationToken);

            // 2. Query locally tracked uncommitted entities in the current DbContext
            var localInvoices = context.BillingInvoices.Local
                .Where(i => i.InvoiceNumber.StartsWith(prefix))
                .Select(i => i.InvoiceNumber);

            var allExisting = dbInvoices.Concat(localInvoices).Distinct().ToList();

            var maxNumber = 0;
            if (allExisting.Count > 0)
            {
                maxNumber = allExisting
                    .Select(n =>
                    {
                        if (n.Length <= prefix.Length) return 0;
                        var suffix = n[prefix.Length..];
                        var digits = new string(suffix.TakeWhile(char.IsDigit).ToArray());
                        return int.TryParse(digits, out var val) ? val : 0;
                    })
                    .DefaultIfEmpty(0)
                    .Max();
            }

            // 3. Reconcile with in-memory reservation cache
            _invoiceSequences.TryGetValue(key, out var currentReserved);
            var nextSeq = Math.Max(maxNumber, currentReserved) + 1;
            _invoiceSequences[key] = nextSeq;

            return $"{prefix}{nextSeq:D4}";
        }
        finally
        {
            _invoiceGate.Release();
        }
    }

    public async Task<string> NextReceiptNumberAsync(DateTime date, CancellationToken cancellationToken = default)
    {
        await _receiptGate.WaitAsync(cancellationToken);
        try
        {
            var period = date.ToString("yyyyMM");
            var prefix = $"REC-{period}-";
            var dbScope = GetDatabaseScope(context);
            var key = $"{dbScope}:{prefix}";

            // 1. Query database for existing committed numbers ignoring soft-delete query filter
            var dbReceipts = await context.PaymentReceipts
                .IgnoreQueryFilters()
                .Where(r => r.ReceiptNumber.StartsWith(prefix))
                .Select(r => r.ReceiptNumber)
                .ToListAsync(cancellationToken);

            // 2. Query locally tracked uncommitted entities in the current DbContext
            var localReceipts = context.PaymentReceipts.Local
                .Where(r => r.ReceiptNumber.StartsWith(prefix))
                .Select(r => r.ReceiptNumber);

            var allExisting = dbReceipts.Concat(localReceipts).Distinct().ToList();

            var maxNumber = 0;
            if (allExisting.Count > 0)
            {
                maxNumber = allExisting
                    .Select(n =>
                    {
                        if (n.Length <= prefix.Length) return 0;
                        var suffix = n[prefix.Length..];
                        var digits = new string(suffix.TakeWhile(char.IsDigit).ToArray());
                        return int.TryParse(digits, out var val) ? val : 0;
                    })
                    .DefaultIfEmpty(0)
                    .Max();
            }

            // 3. Reconcile with in-memory reservation cache
            _receiptSequences.TryGetValue(key, out var currentReserved);
            var nextSeq = Math.Max(maxNumber, currentReserved) + 1;
            _receiptSequences[key] = nextSeq;

            return $"{prefix}{nextSeq:D4}";
        }
        finally
        {
            _receiptGate.Release();
        }
    }

    public static void ResetForTesting()
    {
        _invoiceSequences.Clear();
        _receiptSequences.Clear();
    }

    public static void ResetForTesting(string dbScope)
    {
        var invKeys = _invoiceSequences.Keys.Where(k => k.StartsWith($"{dbScope}:") || k.StartsWith($"inmem:{dbScope}:")).ToList();
        foreach (var k in invKeys) _invoiceSequences.TryRemove(k, out _);

        var recKeys = _receiptSequences.Keys.Where(k => k.StartsWith($"{dbScope}:") || k.StartsWith($"inmem:{dbScope}:")).ToList();
        foreach (var k in recKeys) _receiptSequences.TryRemove(k, out _);
    }

    private static string GetDatabaseScope(IApplicationDbContext context)
    {
        if (context is DbContext dbContext)
        {
            try
            {
                var options = dbContext.GetService<IDbContextOptions>();
                if (options != null)
                {
                    foreach (var ext in options.Extensions)
                    {
                        var prop = ext.GetType().GetProperty("StoreName");
                        if (prop?.GetValue(ext) is string storeName && !string.IsNullOrWhiteSpace(storeName))
                        {
                            return $"inmem:{storeName}";
                        }
                    }
                }

                var connection = dbContext.Database.GetDbConnection();
                if (!string.IsNullOrWhiteSpace(connection.Database))
                {
                    return $"relational:{connection.Database}";
                }
                if (!string.IsNullOrWhiteSpace(connection.ConnectionString))
                {
                    return $"conn:{connection.ConnectionString.GetHashCode()}";
                }
            }
            catch
            {
                // Fallback for providers that do not support connection introspection
            }
        }

        return "default";
    }
}
