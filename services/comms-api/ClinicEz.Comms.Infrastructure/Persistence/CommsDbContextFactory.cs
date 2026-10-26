using System;
using System.IO;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Comms.Infrastructure.Persistence;

public class CommsDbContextFactory : IDesignTimeDbContextFactory<CommsDbContext>
{
    public CommsDbContext CreateDbContext(string[] args)
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
        var basePath = Directory.GetCurrentDirectory();
        var apiPath = Directory.Exists(Path.Combine(basePath, "../ClinicEz.Comms.Api"))
            ? Path.GetFullPath(Path.Combine(basePath, "../ClinicEz.Comms.Api"))
            : (Directory.Exists(Path.Combine(basePath, "services/comms-api/ClinicEz.Comms.Api"))
                ? Path.GetFullPath(Path.Combine(basePath, "services/comms-api/ClinicEz.Comms.Api"))
                : basePath);

        IConfigurationRoot configuration = new ConfigurationBuilder()
            .SetBasePath(apiPath)
            .AddJsonFile("appsettings.json", optional: true, true)
            .AddJsonFile($"appsettings.{environment}.json", optional: true, true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=CLINICEZ_COMMS_DB;Username=clinicez;Password=clinicez";

        var schemaName = configuration["DbSchema"] ?? "comms";

        var optionsBuilder = new DbContextOptionsBuilder<CommsDbContext>();
        optionsBuilder.UseNpgsql(connectionString, npgsql =>
        {
            npgsql.MigrationsHistoryTable("__EFMigrationsHistory", schemaName);
        });

        return new CommsDbContext(optionsBuilder.Options, configuration);
    }
}
