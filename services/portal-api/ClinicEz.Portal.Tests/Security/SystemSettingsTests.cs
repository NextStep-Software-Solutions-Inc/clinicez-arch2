using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Security;

public class SystemSettingsTests
{
    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    [Fact]
    public async Task GetAllSettingsAsync_SeedsDefaultsOnFirstAccess()
    {
        using var db = CreateDbContext();
        var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new SystemSettingsService(db, cache, NullLogger<SystemSettingsService>.Instance);

        var settings = await service.GetAllSettingsAsync();

        Assert.NotEmpty(settings);
        Assert.Contains(settings, s => s.Key == "Licensing:TtlDays" && s.Value == "30");
        Assert.Contains(settings, s => s.Key == "Billing:TrialDays" && s.Value == "14");
        Assert.Contains(settings, s => s.Key == "Workspace:MaxOwnedPerUser" && s.Value == "1");
    }

    [Fact]
    public async Task GetSettingIntAsync_ReturnsParsedOrFallbackDefault()
    {
        using var db = CreateDbContext();
        var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new SystemSettingsService(db, cache, NullLogger<SystemSettingsService>.Instance);

        var ttl = await service.GetSettingIntAsync("Licensing:TtlDays", 30);
        var missing = await service.GetSettingIntAsync("Missing:Key", 99);

        Assert.Equal(30, ttl);
        Assert.Equal(99, missing);
    }

    [Fact]
    public async Task UpdateSettingsAsync_PersistsValueAndInvalidatesCache()
    {
        using var db = CreateDbContext();
        var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new SystemSettingsService(db, cache, NullLogger<SystemSettingsService>.Instance);

        // Warm up cache
        var initial = await service.GetAllSettingsAsync();
        Assert.Contains(initial, s => s.Key == "Billing:TrialDays" && s.Value == "14");

        // Update settings
        var updates = new Dictionary<string, string>
        {
            ["Billing:TrialDays"] = "30",
            ["Licensing:GraceDays"] = "21"
        };
        await service.UpdateSettingsAsync(updates, "AdminUser");

        // Read again
        var updated = await service.GetAllSettingsAsync();
        Assert.Contains(updated, s => s.Key == "Billing:TrialDays" && s.Value == "30" && s.UpdatedBy == "AdminUser");
        Assert.Contains(updated, s => s.Key == "Licensing:GraceDays" && s.Value == "21" && s.UpdatedBy == "AdminUser");
    }
}
