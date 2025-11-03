namespace Portal.Domain.Interfaces;

public interface IBaseSeeder
{
    Task SeedAsync(CancellationToken cancellationToken = default);
}
