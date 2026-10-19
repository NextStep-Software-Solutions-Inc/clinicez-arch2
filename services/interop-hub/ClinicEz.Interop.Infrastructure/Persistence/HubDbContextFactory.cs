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
        var apiPath = Directory.Exists(Path.Combine(basePath, "../ClinicEz.Interop.Api"))
            ? Path.GetFullPath(Path.Combine(basePath, "../ClinicEz.Interop.Api"))
            : basePath;

        IConfigurationRoot configuration = new ConfigurationBuilder()
            .SetBasePath(apiPath)
            .AddJsonFile("appsettings.json", optional: true, true)
            .AddJsonFile($"appsettings.{environment}.json", optional: true, true)
            .AddUserSecrets(Assembly.Load("ClinicEz.Interop.Api"), optional: true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrEmpty(connectionString))
        {
            throw new InvalidOperationException("Could not find a connection string named 'DefaultConnection'. Set it in configuration or via the ConnectionStrings__DefaultConnection environment variable.");
        }

        var schemaName = configuration["DbSchema"] ?? "public";

        var optionsBuilder = new DbContextOptionsBuilder<HubDbContext>();
        optionsBuilder.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", schemaName));
        optionsBuilder.ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));

        return new HubDbContext(optionsBuilder.Options, configuration);
    }
}
