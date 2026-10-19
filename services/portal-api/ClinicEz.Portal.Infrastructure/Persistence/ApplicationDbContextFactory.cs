using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using System.Reflection;

namespace ClinicEz.Portal.Infrastructure.Persistence;

public class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var evironment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
        var basePath = Directory.GetCurrentDirectory();

        IConfigurationRoot configuration = new ConfigurationBuilder()
            .SetBasePath(Path.GetFullPath(Path.Combine(basePath, "../ClinicEz.Portal.Api")))
            .AddJsonFile("appsettings.json", optional: true, true) // Make appsettings optional
            .AddJsonFile($"appsettings.{evironment}.json", optional: true, true) // Make environment-specific appsettings optional
            .AddUserSecrets(Assembly.Load("ClinicEz.Portal.Api"), optional: true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection");
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