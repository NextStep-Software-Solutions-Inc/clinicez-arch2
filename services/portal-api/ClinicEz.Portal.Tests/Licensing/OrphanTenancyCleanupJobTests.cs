using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Services;
using ClinicEz.Portal.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using System;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Licensing;

public class OrphanTenancyCleanupJobTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Mock<IHubOnboardingService> _hubOnboarding = new();
    private readonly Mock<ISystemSettingsService> _settingsService = new();

    public OrphanTenancyCleanupJobTests()
    {
        _settingsService.Setup(s => s.GetSettingIntAsync("Workspace:OrphanInactivityDaysThreshold", 14, It.IsAny<CancellationToken>()))
            .ReturnsAsync(14);
        _settingsService.Setup(s => s.GetSettingIntAsync("Workspace:OrphanAutoPurgeGraceDays", 30, It.IsAny<CancellationToken>()))
            .ReturnsAsync(30);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task ProcessOrphanTenancies_WhenAutoPurgeDisabled_CountsCandidatesWithoutDeleting()
    {
        _settingsService.Setup(s => s.GetSettingBoolAsync("Workspace:OrphanAutoPurgeEnabled", false, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        // Seed 1 eligible orphan older than 14 days
        _context.Tenants.Add(new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "candidate-1",
            Name = "Candidate 1",
            OwnerId = "u1",
            Email = "c1@test.com",
            ActivePatientRecordsCount = 0,
            FacilitiesCount = 0,
            CreatedAt = DateTime.UtcNow.AddDays(-20)
        });
        _context.SaveChanges();

        var job = new OrphanTenancyCleanupJob(
            _context,
            _hubOnboarding.Object,
            TimeProvider.System,
            NullLogger<OrphanTenancyCleanupJob>.Instance,
            _settingsService.Object);

        var count = await job.ProcessOrphanTenanciesAsync(CancellationToken.None);

        Assert.Equal(1, count);
        // Tenant must NOT be deleted
        Assert.NotNull(await _context.Tenants.FirstOrDefaultAsync(t => t.TenantSlug == "candidate-1"));
        _hubOnboarding.Verify(h => h.RevokeWorkspaceAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProcessOrphanTenancies_WhenAutoPurgeEnabled_PurgesOnlyQualifyingGhostsPastGracePeriod()
    {
        _settingsService.Setup(s => s.GetSettingBoolAsync("Workspace:OrphanAutoPurgeEnabled", false, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        // 1. Ghost older than 30 days -> SHOULD BE PURGED
        var oldGhost = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "old-ghost",
            Name = "Old Ghost",
            OwnerId = "u_old",
            Email = "old@test.com",
            ActivePatientRecordsCount = 0,
            FacilitiesCount = 0,
            CreatedAt = DateTime.UtcNow.AddDays(-40)
        };

        // 2. Young ghost (18 days old, past 14d orphan threshold but NOT past 30d grace period) -> RETAINED
        var youngGhost = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "young-ghost",
            Name = "Young Ghost",
            OwnerId = "u_young",
            Email = "young@test.com",
            ActivePatientRecordsCount = 0,
            FacilitiesCount = 0,
            CreatedAt = DateTime.UtcNow.AddDays(-18)
        };

        // 3. Old tenant with patient records -> PROTECTED
        var protectedTenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "protected-clinic",
            Name = "Protected Clinic",
            OwnerId = "u_prot",
            Email = "prot@test.com",
            ActivePatientRecordsCount = 10,
            FacilitiesCount = 0,
            CreatedAt = DateTime.UtcNow.AddDays(-50)
        };

        _context.Tenants.AddRange(oldGhost, youngGhost, protectedTenant);
        _context.SaveChanges();

        var job = new OrphanTenancyCleanupJob(
            _context,
            _hubOnboarding.Object,
            TimeProvider.System,
            NullLogger<OrphanTenancyCleanupJob>.Instance,
            _settingsService.Object);

        var purgedCount = await job.ProcessOrphanTenanciesAsync(CancellationToken.None);

        Assert.Equal(1, purgedCount);
        // Old ghost purged
        Assert.Null(await _context.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.Id == oldGhost.Id));
        // Young ghost & protected clinic retained
        Assert.NotNull(await _context.Tenants.FirstOrDefaultAsync(t => t.Id == youngGhost.Id));
        Assert.NotNull(await _context.Tenants.FirstOrDefaultAsync(t => t.Id == protectedTenant.Id));

        _hubOnboarding.Verify(h => h.RevokeWorkspaceAsync(oldGhost.Id, It.IsAny<CancellationToken>()), Times.Once);
    }
}
