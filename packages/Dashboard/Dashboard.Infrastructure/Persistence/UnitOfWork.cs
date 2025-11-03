using Dashboard.Domain.Interfaces;
using Sieve.Services;

namespace Dashboard.Infrastructure.Persistence;

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

    public void Dispose() => _context.Dispose();
}