using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using System.Reflection;

namespace ClinicEz.Laboratory.Infrastructure.Persistence;

public class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
        var basePath = Directory.GetCurrentDirectory();
        var apiPath = Directory.Exists(Path.Combine(basePath, "../ClinicEz.Laboratory.Api"))
            ? Path.GetFullPath(Path.Combine(basePath, "../ClinicEz.Laboratory.Api"))
            : basePath;

        IConfigurationRoot configuration = new ConfigurationBuilder()
            .SetBasePath(apiPath)
            .AddJsonFile("appsettings.json", optional: true, true)
            .AddJsonFile($"appsettings.{environment}.json", optional: true, true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrEmpty(connectionString))
        {
            throw new InvalidOperationException("Could not find a connection string named 'DefaultConnection'. Set it in configuration or via the ConnectionStrings__DefaultConnection environment variable.");
        }

        var schemaName = configuration["DbSchema"] ?? "public";

        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();
        optionsBuilder.UseNpgsql(connectionString, npgsql =>
        {
            npgsql.MigrationsHistoryTable("__EFMigrationsHistory", schemaName);
        });

        return new ApplicationDbContext(optionsBuilder.Options, configuration);
    }
}



