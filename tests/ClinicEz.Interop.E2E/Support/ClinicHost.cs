using ClinicEz.Clinic.Application;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>
/// Stands in for the HTTP-bound <c>ClinicContext</c>. Outside <see cref="Enter"/> it behaves like a request-less
/// background consumer: no clinic at all, so any handler that leans on the ambient scope instead of the envelope finds nothing.
/// </summary>
public sealed class AmbientClinicContext : IClinicContext
{
    public string TenantId { get; private set; } = string.Empty;

    public Guid ClinicId { get; private set; } = Guid.Empty;

    public Guid? BranchId => null;

    public Guid? StaffId { get; private set; }
    public string? StaffName => null;
    public string? StaffRole => null;

    public IReadOnlyList<string> Permissions => [];

    public bool HasPermission(string permission) => true;

    public IDisposable Enter(string tenantId, Guid clinicId, Guid? staffId = null)
    {
        TenantId = tenantId;
        ClinicId = clinicId;
        StaffId = staffId;
        return new Reset(this);
    }

    private sealed class Reset(AmbientClinicContext owner) : IDisposable
    {
        public void Dispose()
        {
            owner.TenantId = string.Empty;
            owner.ClinicId = Guid.Empty;
            owner.StaffId = null;
        }
    }
}

/// <summary>clinic-api composed by its real <c>AddApplicationServices</c> + <c>AddInfrastructureServices</c> (database swapped for in-memory).</summary>
public sealed class ClinicHost : ServiceHostBase
{
    public AmbientClinicContext Ambient { get; } = new();

    public ClinicHost(HubFixture hub) : base(InteropServices.Clinic)
    {
        var settings = BaseConfig(InteropServices.Clinic, "public");
        settings["Clinic:PortalBaseUrl"] = "https://clinic.e2e.test";
        settings["ClinicEncryption:MasterSecret"] = "e2e-clinic-encryption-master-secret-0123456789";
        var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

        var dbName = $"e2e-clinic-{Guid.NewGuid():N}";
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddApplicationServices();
        services.AddInfrastructureServices(config);

        services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
        services.RemoveAll<IDbContextOptionsConfiguration<ApplicationDbContext>>();
        services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.RemoveAll<IClinicContext>();
        services.AddSingleton<IClinicContext>(Ambient);
        RouteHttpToHub(services, hub);

        Provider = services.BuildServiceProvider();
    }

    /// <summary>Runs <paramref name="action"/> the way an authenticated staff request of that clinic would.</summary>
    public async Task<T> AsStaffAsync<T>(string tenantId, Guid clinicId, Func<IServiceProvider, Task<T>> action, Guid? staffId = null)
    {
        using var scope = Provider.CreateScope();
        using var _ = Ambient.Enter(tenantId, clinicId, staffId);
        return await action(scope.ServiceProvider);
    }

    public Task<T> SendAsync<T>(string tenantId, Guid clinicId, IRequest<T> request, Guid? staffId = null) =>
        AsStaffAsync(tenantId, clinicId, sp => sp.GetRequiredService<ISender>().Send(request), staffId);

    /// <summary>Test inspection and seeding. Callers must use <c>IgnoreQueryFilters()</c>: there is no ambient clinic.</summary>
    public async Task<T> DbAsync<T>(Func<ApplicationDbContext, Task<T>> action)
    {
        using var scope = Provider.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }
}
