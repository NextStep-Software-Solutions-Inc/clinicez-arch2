using ClinicEz.Portal.Application.Features.Tenants.Commands.UpdateTenantSettings;
using ClinicEz.Portal.Application.Features.Tenants.Queries.GetTenantByOwner;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Tenants;

public class TenantSettingsAndMembershipTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Guid _tenantId = Guid.NewGuid();
    private const string TenantSlug = "metro-clinic";

    public TenantSettingsAndMembershipTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new ApplicationDbContext(options);

        var tenant = new Tenant
        {
            Id = _tenantId,
            TenantSlug = TenantSlug,
            Name = "Metro Clinic",
            OwnerId = "clerk_owner_111",
            Email = "owner@metro.ph",
            PhoneNumber = "+639170000000",
            FirstName = "Juan",
            LastName = "Dela Cruz"
        };
        _context.Tenants.Add(tenant);

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            UserId = "clerk_biller_222",
            Email = "biller@metro.ph",
            FullName = "Bob Biller",
            Role = "Biller",
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };
        _context.StaffMembers.Add(staff);

        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task GetTenantByOwner_OwnerUser_ReturnsOwnerRole()
    {
        var handler = new GetTenantByOwnerQueryHandler(_context);
        var result = await handler.Handle(new GetTenantByOwnerQuery("clerk_owner_111"), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(TenantSlug, result.TenantSlug);
        Assert.Equal("Owner", result.Role);
        Assert.Equal("Active", result.Status);
    }

    [Fact]
    public async Task GetTenantByOwner_StaffUser_ReturnsAssignedRole()
    {
        var handler = new GetTenantByOwnerQueryHandler(_context);
        var result = await handler.Handle(new GetTenantByOwnerQuery("clerk_biller_222"), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(TenantSlug, result.TenantSlug);
        Assert.Equal("Biller", result.Role);
        Assert.Equal("Active", result.Status);
    }

    [Fact]
    public async Task GetTenantByOwner_WithTenantSlug_ResolvesSpecifiedWorkspace()
    {
        var handler = new GetTenantByOwnerQueryHandler(_context);
        var result = await handler.Handle(new GetTenantByOwnerQuery("clerk_biller_222", TenantSlug), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(TenantSlug, result.TenantSlug);
        Assert.Equal("Biller", result.Role);
    }

    [Fact]
    public async Task UpdateTenantSettings_ValidRequest_UpdatesDatabase()
    {
        var handler = new UpdateTenantSettingsCommandHandler(_context);
        var command = new UpdateTenantSettingsCommand(
            TenantSlug: TenantSlug,
            Name: "Metro Super Clinic",
            RepresentativeName: "Maria Santos",
            Email: "maria@metro.ph",
            PhoneNumber: "+639189999999",
            Timezone: "UTC+08:00 Manila, Singapore"
        );

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("Metro Super Clinic", result.Name);
        Assert.Equal("Maria Santos", result.RepresentativeName);
        Assert.Equal("maria@metro.ph", result.Email);
        Assert.Equal("+639189999999", result.PhoneNumber);

        // Verify in DB
        var tenantInDb = await _context.Tenants.FirstOrDefaultAsync(t => t.Id == _tenantId);
        Assert.NotNull(tenantInDb);
        Assert.Equal("Metro Super Clinic", tenantInDb.Name);
        Assert.Equal("Maria", tenantInDb.FirstName);
        Assert.Equal("Santos", tenantInDb.LastName);
        Assert.Equal("maria@metro.ph", tenantInDb.Email);
        Assert.Equal("+639189999999", tenantInDb.PhoneNumber);
    }
}
