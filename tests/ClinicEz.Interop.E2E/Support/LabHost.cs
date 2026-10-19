using ClinicEz.Laboratory.Application;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Infrastructure;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>laboratory-api composed by its real <c>AddApplicationServices</c> + <c>AddInfrastructureServices</c> (database swapped for in-memory).</summary>
public sealed class LabHost : ServiceHostBase
{
    public LabHost(HubFixture hub) : base(InteropServices.Laboratory)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(BaseConfig(InteropServices.Laboratory, "public")).Build();

        var dbName = $"e2e-lab-{Guid.NewGuid():N}";
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

    /// <summary>Runs code the way an authenticated staff request of that laboratory would: scoped to its tenant and laboratory.</summary>
    public async Task<T> AsStaffAsync<T>(string tenantId, Guid laboratoryId, Func<IServiceProvider, Task<T>> action)
    {
        using var scope = Provider.CreateScope();
        using var facility = scope.ServiceProvider.GetRequiredService<ILabContext>().BeginFacilityScope(tenantId, laboratoryId);
        return await action(scope.ServiceProvider);
    }

    public Task<T> SendAsync<T>(string tenantId, Guid laboratoryId, IRequest<T> request) =>
        AsStaffAsync(tenantId, laboratoryId, sp => sp.GetRequiredService<ISender>().Send(request));

    /// <summary>Test inspection and seeding: sees every tenant's rows (system scope), like an administrative job.</summary>
    public async Task<T> DbAsync<T>(Func<ApplicationDbContext, Task<T>> action)
    {
        using var scope = Provider.CreateScope();
        using var system = scope.ServiceProvider.GetRequiredService<ILabContext>().BeginSystemScope();
        return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }
}
