namespace CLINICEZ.TenantManagement.Domain.Interfaces;

public interface IBaseSeeder
{
    Task SeedAsync(CancellationToken cancellationToken = default);
}
