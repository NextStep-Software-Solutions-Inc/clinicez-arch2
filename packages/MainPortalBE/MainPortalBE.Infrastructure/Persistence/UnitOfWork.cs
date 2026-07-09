using MainPortalBE.Domain.Interfaces;
using MainPortalBE.Infrastructure.Persistence.Repositories;
using Sieve.Services;

namespace MainPortalBE.Infrastructure.Persistence;

public sealed class UnitOfWork : IUnitOfWork, IDisposable
{
    private readonly ApplicationDbContext _context;

    public IExampleRepository ExampleRepository { get; }

    public UnitOfWork(ApplicationDbContext context, ISieveProcessor sieveProcessor)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
        ExampleRepository = new ExampleRepository(_context, sieveProcessor);
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return _context.SaveChangesAsync(cancellationToken);
    }

    public void Dispose() => _context.Dispose();
}
