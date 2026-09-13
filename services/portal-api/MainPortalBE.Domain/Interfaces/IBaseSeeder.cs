namespace MainPortalBE.Domain.Interfaces;

public interface IBaseSeeder
{
    Task SeedAsync(CancellationToken cancellationToken = default);
}
