using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Tenants;

public class LookupTenantEndpointTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private const string ExistingSlug = "tenant1";

    public LookupTenantEndpointTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new ApplicationDbContext(options);

        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = ExistingSlug,
            Name = "Tenant One Medical",
            OwnerId = "clerk_owner_tenant1",
            Email = "owner@tenant1.ph",
            FirstName = "First",
            LastName = "User"
        };
        _context.Tenants.Add(tenant);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task LookupTenant_ExistingSlug_ReturnsTenant()
    {
        var cleanSlug = ExistingSlug.Trim().ToLowerInvariant();
        var tenant = await _context.Tenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == cleanSlug);

        Assert.NotNull(tenant);
        Assert.Equal(ExistingSlug, tenant.TenantSlug);
        Assert.Equal("Tenant One Medical", tenant.Name);
    }

    [Fact]
    public async Task LookupTenant_NonExistentSlug_ReturnsNull()
    {
        const string nonExistent = "notfound";
        var cleanSlug = nonExistent.Trim().ToLowerInvariant();
        var tenant = await _context.Tenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == cleanSlug);

        Assert.Null(tenant);
    }
}
