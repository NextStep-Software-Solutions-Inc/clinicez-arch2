using System;
using System.Threading.Tasks;
using ClinicEz.Shared.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace ClinicEz.Shared.Tests.Persistence;

public class DevelopmentDatabaseAutoCreatorTests
{
    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "TestApp";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class TestInMemoryDbContext : DbContext
    {
        public TestInMemoryDbContext(DbContextOptions<TestInMemoryDbContext> options) : base(options) { }
    }

    [Fact]
    public async Task EnsureDevelopmentDatabaseCreatedAsync_WhenProductionEnvironment_DoesNothing()
    {
        var prodEnv = new TestHostEnvironment(Environments.Production);
        var options = new DbContextOptionsBuilder<TestInMemoryDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        using var context = new TestInMemoryDbContext(options);

        // Should return cleanly without throwing or attempting to connect
        await context.EnsureDevelopmentDatabaseCreatedAsync(prodEnv);
    }

    [Fact]
    public async Task EnsureDevelopmentDatabaseCreatedAsync_WhenStagingEnvironment_DoesNothing()
    {
        var stagingEnv = new TestHostEnvironment(Environments.Staging);
        var options = new DbContextOptionsBuilder<TestInMemoryDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        using var context = new TestInMemoryDbContext(options);

        await context.EnsureDevelopmentDatabaseCreatedAsync(stagingEnv);
    }

    [Fact]
    public async Task EnsureDevelopmentDatabaseCreatedAsync_WhenNonRelationalProvider_DoesNothing()
    {
        var devEnv = new TestHostEnvironment(Environments.Development);
        var options = new DbContextOptionsBuilder<TestInMemoryDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        using var context = new TestInMemoryDbContext(options);

        // In-memory provider is not relational, should return cleanly
        await context.EnsureDevelopmentDatabaseCreatedAsync(devEnv);
    }

    [Fact]
    public void EnsureDevelopmentDatabaseCreated_Sync_WhenNonRelational_DoesNothing()
    {
        var devEnv = new TestHostEnvironment(Environments.Development);
        var options = new DbContextOptionsBuilder<TestInMemoryDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        using var context = new TestInMemoryDbContext(options);

        context.EnsureDevelopmentDatabaseCreated(devEnv);
    }

    [Fact]
    public void EnsureDevelopmentDatabaseCreatedAndMigrated_WhenNonRelational_DoesNothing()
    {
        var devEnv = new TestHostEnvironment(Environments.Development);
        var options = new DbContextOptionsBuilder<TestInMemoryDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        using var context = new TestInMemoryDbContext(options);

        // When non-relational, Migrate() is skipped by relational check
        context.EnsureDevelopmentDatabaseCreatedAndMigrated(devEnv);
    }
}
