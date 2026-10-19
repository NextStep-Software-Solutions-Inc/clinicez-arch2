using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using System.Reflection;

namespace ClinicEz.Pharmacy.Infrastructure.Persistence;

public class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var evironment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
        var basePath = Directory.GetCurrentDirectory();

        IConfigurationRoot configuration = new ConfigurationBuilder()
            .SetBasePath(Path.GetFullPath(Path.Combine(basePath, "../ClinicEz.Pharmacy.Api")))
            .AddJsonFile("appsettings.json", optional: true, true) // Make appsettings optional
            .AddJsonFile($"appsettings.{evironment}.json", optional: true, true) // Make environment-specific appsettings optional
            .AddUserSecrets(Assembly.Load("ClinicEz.Pharmacy.Api"), optional: true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrEmpty(connectionString))
        {
            throw new InvalidOperationException("Could not find a connection string named 'DefaultConnection'. Set it in configuration or via the ConnectionStrings__DefaultConnection environment variable.");
        }

        var schemaName = configuration["DbSchema"] ?? "public";

        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();
        optionsBuilder.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", schemaName));

        return new ApplicationDbContext(
            optionsBuilder.Options,
            configuration,
            new ClinicEz.Pharmacy.Infrastructure.Context.PharmacyContext(new Microsoft.AspNetCore.Http.HttpContextAccessor(), configuration));
    }
}



