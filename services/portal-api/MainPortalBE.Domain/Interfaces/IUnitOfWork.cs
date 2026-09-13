namespace MainPortalBE.Domain.Interfaces;

public interface IUnitOfWork
{
    IExampleRepository ExampleRepository { get; }
    ITenantRepository TenantRepository { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}