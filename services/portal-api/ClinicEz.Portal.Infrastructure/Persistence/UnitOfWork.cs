using ClinicEz.Portal.Domain.Interfaces;
using ClinicEz.Portal.Infrastructure.Persistence.Repositories;
using Sieve.Services;

namespace ClinicEz.Portal.Infrastructure.Persistence;

public sealed class UnitOfWork : IUnitOfWork, IDisposable
{
    private readonly ApplicationDbContext _context;

    public IExampleRepository ExampleRepository { get; }
    public ITenantRepository TenantRepository { get; }

    public UnitOfWork(ApplicationDbContext context, IExampleRepository exampleRepository, ITenantRepository tenantRepository)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
        ExampleRepository = exampleRepository;
        TenantRepository = tenantRepository;
    }

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return _context.SaveChangesAsync(cancellationToken);
    }

    public void Dispose() => _context.Dispose();
}
