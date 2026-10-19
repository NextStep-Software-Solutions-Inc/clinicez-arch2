using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using System.Reflection;

namespace ClinicEz.Portal.Infrastructure.Persistence;

public class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
        var currentDir = Directory.GetCurrentDirectory();
        var candidatePaths = new[]
        {
            Path.Combine(currentDir, "services/portal-api/ClinicEz.Portal.Api"),
            Path.Combine(currentDir, "../ClinicEz.Portal.Api"),
            currentDir
        };
        var apiPath = candidatePaths.FirstOrDefault(Directory.Exists) ?? currentDir;

        var builder = new ConfigurationBuilder()
            .SetBasePath(Path.GetFullPath(apiPath))
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: false)
            .AddJsonFile($"appsettings.{environment}.json", optional: true, reloadOnChange: false)
            .AddEnvironmentVariables();

        try
        {
            builder.AddUserSecrets(Assembly.Load("ClinicEz.Portal.Api"), optional: true);
        }
        catch
        {
            // Ignore if UserSecrets assembly cannot be loaded at design-time
        }

        var configuration = builder.Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? Environment.GetEnvironmentVariable("CONNECTION_STRING");

        if (string.IsNullOrEmpty(connectionString))
        {
            throw new InvalidOperationException("Could not find a connection string named 'DefaultConnection'. Set it in configuration or via the ConnectionStrings__DefaultConnection environment variable.");
        }

        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();
        optionsBuilder.UseNpgsql(connectionString, npgsqlOptions =>
        {
            npgsqlOptions.MigrationsHistoryTable("__EFMigrationsHistory", "public");
        });

        return new ApplicationDbContext(optionsBuilder.Options);
    }
}