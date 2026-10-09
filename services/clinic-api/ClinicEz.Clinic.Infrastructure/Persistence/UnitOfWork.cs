using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Sieve.Services;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

public sealed class UnitOfWork : IUnitOfWork, IDisposable
{
    private readonly ApplicationDbContext _context;

    public IProductRepository ProductRepository { get; }

    public UnitOfWork(
        ApplicationDbContext context,
        ISieveProcessor sieveProcessor,
        IProductRepository productRepository)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));

        ProductRepository = productRepository ?? throw new ArgumentNullException(nameof(productRepository));
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return _context.SaveChangesAsync(cancellationToken);
    }

    public async Task ExecuteInTransactionAsync(Func<CancellationToken, Task> action, CancellationToken cancellationToken = default)
    {
        var relational = _context.Database.IsRelational();
        await using var tx = relational ? await _context.Database.BeginTransactionAsync(cancellationToken) : null;
        try
        {
            await action(cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);
            if (tx != null)
            {
                await tx.CommitAsync(cancellationToken);
            }
        }
        catch
        {
            if (tx != null)
            {
                await tx.RollbackAsync(cancellationToken);
            }
            throw;
        }
    }

    public async Task<T> ExecuteInTransactionAsync<T>(Func<CancellationToken, Task<T>> action, CancellationToken cancellationToken = default)
    {
        var relational = _context.Database.IsRelational();
        await using var tx = relational ? await _context.Database.BeginTransactionAsync(cancellationToken) : null;
        try
        {
            var result = await action(cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);
            if (tx != null)
            {
                await tx.CommitAsync(cancellationToken);
            }
            return result;
        }
        catch
        {
            if (tx != null)
            {
                await tx.RollbackAsync(cancellationToken);
            }
            throw;
        }
    }

    public void Dispose() => _context.Dispose();
}


