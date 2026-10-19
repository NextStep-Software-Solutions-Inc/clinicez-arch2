using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using System.Reflection;

namespace ClinicEz.Interop.Infrastructure.Persistence;

public class HubDbContextFactory : IDesignTimeDbContextFactory<HubDbContext>
{
    public HubDbContext CreateDbContext(string[] args)
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
        var basePath = Directory.GetCurrentDirectory();

        IConfigurationRoot configuration = new ConfigurationBuilder()
            .SetBasePath(Path.GetFullPath(Path.Combine(basePath, "../ClinicEz.Interop.Api")))
            .AddJsonFile("appsettings.json", optional: true, true)
            .AddJsonFile($"appsettings.{environment}.json", optional: true, true)
            .AddUserSecrets(Assembly.Load("ClinicEz.Interop.Api"), optional: true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrEmpty(connectionString))
        {
            throw new InvalidOperationException("Could not find a connection string named 'DefaultConnection'.");
        }

        var optionsBuilder = new DbContextOptionsBuilder<HubDbContext>();
        optionsBuilder.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", configuration["DbSchema"]));

        return new HubDbContext(optionsBuilder.Options, configuration);
    }
}
