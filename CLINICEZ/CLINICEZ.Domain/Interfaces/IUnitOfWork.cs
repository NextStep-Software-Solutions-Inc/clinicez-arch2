namespace CLINICEZ.Domain.Interfaces;

public interface IUnitOfWork
{
    IProductRepository ProductRepository { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}