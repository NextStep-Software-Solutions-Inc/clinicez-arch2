using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure;

/// <summary>
/// Design-time factory for EF Core CLI tools (dotnet ef migrations add / update).
/// Resolves the connection string from the same config sources the runtime uses —
/// appsettings.json, appsettings.Development.json, environment variables, and
/// user-secrets of the ClinicEz.Patient.Api project. No values are hard-coded here.
/// </summary>
public sealed class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        // Walk up to packages/ so we can locate the Api project's appsettings files.
        var basePath = Path.Combine(
            Directory.GetCurrentDirectory(),
            "..",
            "ClinicEz.Patient.Api");

        if (!Directory.Exists(basePath))
        {
            // Fallback: current directory (e.g. when run from the Infrastructure project root)
            basePath = Directory.GetCurrentDirectory();
        }

        var configuration = new ConfigurationBuilder()
            .SetBasePath(Path.GetFullPath(basePath))
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddEnvironmentVariables()
            // User secrets — shares the same UserSecretsId as ClinicEz.Patient.Api
            .AddUserSecrets<ApplicationDbContextFactory>(optional: true)
            .Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException(
                "Connection string 'DefaultConnection' was not found. " +
                "Set it in appsettings.Development.json, user-secrets, or the " +
                "CONNECTIONSTRINGS__DEFAULTCONNECTION environment variable.");

        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName))
            .UseSnakeCaseNamingConvention();

        return new ApplicationDbContext(optionsBuilder.Options, currentUserService: null);
    }
}

