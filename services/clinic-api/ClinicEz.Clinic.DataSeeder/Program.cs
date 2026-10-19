using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.DataSeeder;

internal class Program
{
    private static async Task<int> Main(string[] args)
    {
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine(@"
======================================================================
  Clinic EZ Development Patient & Clinical Record Seeder
  Scalability & Browser Capacity Load Generator (1000+ Records)
======================================================================");
        Console.ResetColor();

        // 1. Parse CLI arguments
        var count = 1000;
        var clearExisting = false;
        string? connectionString = null;
        string? tenantId = null;
        Guid? clinicId = null;
        var batchSize = 100;

        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            if (arg.Equals("--count", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                if (int.TryParse(args[++i], out var c) && c > 0) count = c;
            }
            else if (arg.Equals("--clear", StringComparison.OrdinalIgnoreCase))
            {
                clearExisting = true;
            }
            else if (arg.Equals("--connection", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                connectionString = args[++i];
            }
            else if (arg.Equals("--tenant", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                tenantId = args[++i];
            }
            else if (arg.Equals("--clinic", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                if (Guid.TryParse(args[++i], out var g)) clinicId = g;
            }
            else if (arg.Equals("--batch", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                if (int.TryParse(args[++i], out var b) && b > 0) batchSize = b;
            }
            else if (arg.Equals("--help", StringComparison.OrdinalIgnoreCase) || arg.Equals("-h", StringComparison.OrdinalIgnoreCase))
            {
                PrintHelp();
                return 0;
            }
        }

        // 2. Discover Connection String if not provided via CLI
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");
        }

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            // Try reading from ClinicEz.Clinic.Api appsettings
            var candidatePaths = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "../../../../services/clinic-api/ClinicEz.Clinic.Api/appsettings.Development.json"),
                Path.Combine(AppContext.BaseDirectory, "../../../../services/clinic-api/ClinicEz.Clinic.Api/appsettings.json"),
                Path.Combine(Directory.GetCurrentDirectory(), "services/clinic-api/ClinicEz.Clinic.Api/appsettings.Development.json"),
                Path.Combine(Directory.GetCurrentDirectory(), "appsettings.Development.json"),
                Path.Combine(Directory.GetCurrentDirectory(), "appsettings.json")
            };

            foreach (var path in candidatePaths)
            {
                if (File.Exists(path))
                {
                    var config = new ConfigurationBuilder().AddJsonFile(Path.GetFullPath(path)).Build();
                    var found = config.GetConnectionString("DefaultConnection");
                    if (!string.IsNullOrWhiteSpace(found))
                    {
                        connectionString = found;
                        break;
                    }
                }
            }
        }

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("Connection string 'DefaultConnection' was not provided via CLI, environment variable ConnectionStrings__DefaultConnection, or appsettings.json.");
        }

        Console.WriteLine($"[Config] Target Patients   : {count:N0}");
        Console.WriteLine($"[Config] Batch Size        : {batchSize}");
        Console.WriteLine($"[Config] Clear Existing    : {clearExisting}");
        Console.WriteLine($"[Config] Connection String : {MaskConnectionString(connectionString)}");
        Console.WriteLine();

        // 3. Configure DbContext
        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();
        optionsBuilder.UseNpgsql(connectionString, npgsqlOptions =>
        {
            npgsqlOptions.MigrationsHistoryTable("__EFMigrationsHistory", "public");
        });

        var dummyConfig = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new System.Collections.Generic.KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        using var loggerFactory = LoggerFactory.Create(builder =>
        {
            builder.AddSimpleConsole(opt =>
            {
                opt.SingleLine = true;
                opt.TimestampFormat = "HH:mm:ss ";
            });
            builder.SetMinimumLevel(LogLevel.Information);
        });
        var logger = loggerFactory.CreateLogger<DevPatientSeederLogger>();

        try
        {
            await using var dbContext = new ApplicationDbContext(optionsBuilder.Options, dummyConfig);

            Console.WriteLine("[DB] Testing connection to PostgreSQL database...");
            var canConnect = await dbContext.Database.CanConnectAsync();
            if (!canConnect)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"[Error] Unable to connect to the database with the provided connection string.");
                Console.WriteLine($"Please verify that PostgreSQL is running on the host/port specified.");
                Console.ResetColor();
                return 1;
            }
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[DB] Connected successfully.");
            Console.ResetColor();

            var seedOptions = new PatientSeedOptions
            {
                Count = count,
                ClearExistingSeededPatients = clearExisting,
                BatchSize = batchSize,
                TenantId = tenantId,
                ClinicId = clinicId,
                ProgressCallback = (current, total) =>
                {
                    var percent = (double)current / total * 100;
                    Console.Write($"\r[Progress] {current:N0} / {total:N0} patients generated ({percent:F0}%)...");
                }
            };

            Console.WriteLine("[Seeder] Generating rich clinical records...");
            var result = await DevPatientSeeder.SeedAsync(dbContext, seedOptions, logger, CancellationToken.None);

            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine(@"
======================================================================
  SEEDING COMPLETE SUMMARY
======================================================================");
            Console.WriteLine($"  Patients Created              : {result.PatientsCreated:N0}");
            Console.WriteLine($"  Encounters (SOAP)             : {result.EncountersCreated:N0}");
            Console.WriteLine($"  Prescriptions (Rx Items)      : {result.PrescriptionsCreated:N0}");
            Console.WriteLine($"  Medical Certificates Issued   : {result.MedicalCertificatesCreated:N0}");
            Console.WriteLine($"  Past Medical Histories        : {result.PastMedicalHistoriesCreated:N0}");
            Console.WriteLine($"  Family Histories              : {result.FamilyHistoriesCreated:N0}");
            Console.WriteLine($"  Social Histories              : {result.SocialHistoriesCreated:N0}");
            Console.WriteLine($"  Surgical Histories            : {result.SurgicalHistoriesCreated:N0}");
            Console.WriteLine($"  Reproductive Histories        : {result.ReproductiveHistoriesCreated:N0}");
            Console.WriteLine($"  Physical Exam Profiles        : {result.PhysicalExamProfilesCreated:N0}");
            Console.WriteLine($"  Structured Allergies          : {result.AllergiesCreated:N0}");
            Console.WriteLine($"  Active/Resolved Problems      : {result.ProblemsCreated:N0}");
            Console.WriteLine($"  Immunizations Administered    : {result.ImmunizationsCreated:N0}");
            Console.WriteLine($"  Total Relational Rows Created : ~{(result.PatientsCreated + result.EncountersCreated + result.PrescriptionsCreated + result.MedicalCertificatesCreated + result.PastMedicalHistoriesCreated + result.FamilyHistoriesCreated + result.SocialHistoriesCreated + result.SurgicalHistoriesCreated + result.ReproductiveHistoriesCreated + result.PhysicalExamProfilesCreated + result.AllergiesCreated + result.ProblemsCreated + result.ImmunizationsCreated):N0}");
            Console.WriteLine($"  Elapsed Time                  : {result.Elapsed.TotalSeconds:F2} seconds");
            Console.WriteLine($"  Throughput                    : {result.PatientsCreated / Math.Max(0.1, result.Elapsed.TotalSeconds):F1} patients/sec");
            Console.WriteLine($"  Tenant ID                     : {result.TenantId}");
            Console.WriteLine($"  Clinic ID                     : {result.ClinicId}");
            Console.WriteLine($"  Attending Clinician           : {result.DoctorName}");
            if (result.SamplePatientCodes.Count > 0)
            {
                Console.WriteLine($"  Sample Codes Generated        : {string.Join(", ", result.SamplePatientCodes)}");
            }
            Console.WriteLine("======================================================================");
            Console.ResetColor();

            return 0;
        }
        catch (Exception ex)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine();
            Console.WriteLine($"[Fatal Error] Seeder failed with exception: {ex.Message}");
            Console.WriteLine(ex.StackTrace);
            Console.ResetColor();
            return 1;
        }
    }

    private static void PrintHelp()
    {
        Console.WriteLine(@"
Usage:
  dotnet run --project services/clinic-api/ClinicEz.Clinic.DataSeeder [options]

Options:
  --count <number>       Number of patient records to generate (default: 1000)
  --batch <number>       Batch size for database insertions (default: 100)
  --clear                Purge previously seeded test patients before generating
  --connection <string>  PostgreSQL connection string
  --tenant <id>          Tenant identifier (default: tenant_default or from DB)
  --clinic <guid>        Clinic GUID (default: from DB or 11111111-1111-1111-1111-111111111111)
  --help, -h             Show this help information
");
    }

    private static string MaskConnectionString(string connStr)
    {
        try
        {
            var parts = connStr.Split(';');
            for (var i = 0; i < parts.Length; i++)
            {
                if (parts[i].Trim().StartsWith("Password=", StringComparison.OrdinalIgnoreCase))
                {
                    parts[i] = "Password=********";
                }
            }
            return string.Join(";", parts);
        }
        catch
        {
            return "********";
        }
    }
}

internal class DevPatientSeederLogger { }
