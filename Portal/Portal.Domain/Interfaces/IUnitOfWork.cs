namespace Portal.Domain.Interfaces;

public interface IUnitOfWork
{
    IExampleRepository ExampleRepository { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}