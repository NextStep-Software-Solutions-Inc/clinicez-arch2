namespace ClinicEz.Organization.Domain.Interfaces;

public interface IUnitOfWork
{
    IProductRepository ProductRepository { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}



