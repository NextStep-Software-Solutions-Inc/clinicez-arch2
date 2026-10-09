using ClinicEz.Pharmacy.Application;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>pharmacy-api composed by its real <c>AddApplicationServices</c> + <c>AddInfrastructureServices</c> (database swapped for in-memory).</summary>
public sealed class PharmacyHost : ServiceHostBase
{
    public PharmacyHost(HubFixture hub) : base(InteropServices.Pharmacy)
    {
        var settings = BaseConfig(InteropServices.Pharmacy, "pharmacy_dashboard");
        settings["Gamot:UpscSecretKey"] = "e2e-pharmacy-upsc-secret-key-0123456789abcdef";
        var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

        var dbName = $"e2e-pharmacy-{Guid.NewGuid():N}";
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddApplicationServices();
        services.AddInfrastructureServices(config);

        services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
        services.RemoveAll<IDbContextOptionsConfiguration<ApplicationDbContext>>();
        services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        RouteHttpToHub(services, hub);

        Provider = services.BuildServiceProvider();
    }

    /// <summary>Runs code the way an authenticated staff request of that pharmacy would: scoped to its tenant and pharmacy.</summary>
    public async Task<T> AsStaffAsync<T>(string tenantId, Guid pharmacyId, Func<IServiceProvider, Task<T>> action)
    {
        using var scope = Provider.CreateScope();
        scope.ServiceProvider.GetRequiredService<IPharmacyScopeSetter>().Enter(tenantId, pharmacyId);
        return await action(scope.ServiceProvider);
    }

    public Task<T> SendAsync<T>(string tenantId, Guid pharmacyId, IRequest<T> request) =>
        AsStaffAsync(tenantId, pharmacyId, sp => sp.GetRequiredService<ISender>().Send(request));

    /// <summary>Test inspection and seeding. Callers must use <c>IgnoreQueryFilters()</c> or enter a scope: there is no ambient pharmacy.</summary>
    public async Task<T> DbAsync<T>(Func<ApplicationDbContext, Task<T>> action)
    {
        using var scope = Provider.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }
}
