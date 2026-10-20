using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Application.Services;

public static class UnitOfWorkExtensions
{
    /// <summary>Saves, turning an optimistic-concurrency clash (two cashiers touching the same record) into a retryable 409.</summary>
    public static async Task SaveOrConflictAsync(this IBillingDbContext db, CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            throw new ConflictException("Another cashier changed the same record at the same time. Reload and try again.", ex);
        }
    }
}
