using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.Infrastructure.Storage;
using ClinicEz.Comms.MigrationTool.Models;
using ClinicEz.Comms.MigrationTool.Services;
using ClinicEz.Shared.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Comms.MigrationTool;

public class Program
{
    public static async Task<int> Main(string[] args)
    {
        if (args.Length == 0)
        {
            PrintUsage();
            return MigrationExitCodes.ArgumentError;
        }

        var command = args[0].ToLowerInvariant();
        var parsedArgs = ParseArgs(args[1..]);

        try
        {
            switch (command)
            {
                case "export":
                    return await HandleExportAsync(parsedArgs);

                case "import":
                    return await HandleImportAsync(parsedArgs);

                case "verify":
                    return await HandleVerifyAsync(parsedArgs);

                case "inspect":
                    return await HandleInspectAsync(parsedArgs);

                default:
                    Console.Error.WriteLine($"Unknown command '{command}'.");
                    PrintUsage();
                    return MigrationExitCodes.ArgumentError;
            }
        }
        catch (ArgumentException ex)
        {
            Console.Error.WriteLine($"[Argument Error]: {ex.Message}");
            return MigrationExitCodes.ArgumentError;
        }
        catch (CryptographicException ex)
        {
            if (ex.Message.Contains("signature", StringComparison.OrdinalIgnoreCase))
            {
                Console.Error.WriteLine($"[Signature Failure]: {ex.Message}");
                return MigrationExitCodes.SignatureFailure;
            }
            if (ex.Message.Contains("checksum", StringComparison.OrdinalIgnoreCase) ||
                ex.Message.Contains("hash", StringComparison.OrdinalIgnoreCase) ||
                ex.Message.Contains("integrity", StringComparison.OrdinalIgnoreCase))
            {
                Console.Error.WriteLine($"[Checksum Mismatch]: {ex.Message}");
                return MigrationExitCodes.ChecksumMismatch;
            }

            Console.Error.WriteLine($"[Crypto / Decryption Failure]: {ex.Message}");
            return MigrationExitCodes.IoOrCryptoFailure;
        }
        catch (InvalidOperationException ex)
        {
            if (ex.Message.Contains("collision", StringComparison.OrdinalIgnoreCase) ||
                ex.Message.Contains("conflict", StringComparison.OrdinalIgnoreCase))
            {
                Console.Error.WriteLine($"[Database Conflict]: {ex.Message}");
                return MigrationExitCodes.DatabaseConflict;
            }

            if (ex.Message.Contains("verification failed", StringComparison.OrdinalIgnoreCase))
            {
                Console.Error.WriteLine($"[Checksum / Row Count Mismatch]: {ex.Message}");
                return MigrationExitCodes.ChecksumMismatch;
            }

            Console.Error.WriteLine($"[Operation Error]: {ex.Message}");
            return MigrationExitCodes.IoOrCryptoFailure;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Failure]: {ex.Message}");
            return MigrationExitCodes.IoOrCryptoFailure;
        }
    }

    private static async Task<int> HandleExportAsync(Dictionary<string, string> args)
    {
        if (!args.TryGetValue("--tenant", out var tenant) || string.IsNullOrWhiteSpace(tenant))
        {
            Console.Error.WriteLine("Error: Missing required argument '--tenant'.");
            return MigrationExitCodes.ArgumentError;
        }

        if (!args.TryGetValue("--output", out var output) || string.IsNullOrWhiteSpace(output))
        {
            output = $"{tenant}-{DateTime.UtcNow:yyyyMMddHHmmss}.clinicez-comms-bundle";
        }

        var passphrase = args.GetValueOrDefault("--bundle-passphrase")
            ?? args.GetValueOrDefault("--passphrase")
            ?? Environment.GetEnvironmentVariable("COMMS_MIGRATION_PASSPHRASE")
            ?? "clinicez-migration-default-passphrase-2026!";

        var signerKey = await ResolveKeyAsync(args.GetValueOrDefault("--signer-key"), "COMMS_MIGRATION_SIGNER_KEY");

        if (string.IsNullOrWhiteSpace(signerKey))
        {
            // Generate ephemeral key for export if not supplied
            using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
            signerKey = ecdsa.ExportECPrivateKeyPem();
        }

        var dryRun = args.ContainsKey("--dry-run");
        var connection = args.GetValueOrDefault("--connection");
        var storagePath = args.GetValueOrDefault("--storage-path");
        var cellKey = args.GetValueOrDefault("--cell-key");

        var services = CreateServices(connection, storagePath, cellKey);
        var exportService = services.GetRequiredService<MigrationExportService>();

        Console.WriteLine($"Exporting tenant '{tenant}'...");
        var result = await exportService.ExportAsync(
            tenantId: tenant,
            outputPath: output,
            bundlePassphrase: passphrase,
            signerPrivateKeyPemOrBase64: signerKey,
            dryRun: dryRun);

        Console.WriteLine($"Export complete. Bundle: {result.BundlePath}");
        Console.WriteLine($"DryRun: {result.IsDryRun}");
        Console.WriteLine("Entity Counts:");
        foreach (var (key, count) in result.RecordCounts)
        {
            Console.WriteLine($"  {key}: {count}");
        }

        return MigrationExitCodes.Success;
    }

    private static async Task<int> HandleImportAsync(Dictionary<string, string> args)
    {
        if (!args.TryGetValue("--bundle", out var bundle) || string.IsNullOrWhiteSpace(bundle))
        {
            Console.Error.WriteLine("Error: Missing required argument '--bundle'.");
            return MigrationExitCodes.ArgumentError;
        }

        var passphrase = args.GetValueOrDefault("--bundle-passphrase")
            ?? args.GetValueOrDefault("--passphrase")
            ?? Environment.GetEnvironmentVariable("COMMS_MIGRATION_PASSPHRASE")
            ?? "clinicez-migration-default-passphrase-2026!";

        var trustedKey = await ResolveKeyAsync(args.GetValueOrDefault("--trusted-signer-key"), "COMMS_MIGRATION_TRUSTED_SIGNER_KEY");

        var dryRun = args.ContainsKey("--dry-run");
        var verifyOnly = args.ContainsKey("--verify-only");
        var allowOverwrite = args.ContainsKey("--allow-overwrite");

        var connection = args.GetValueOrDefault("--connection");
        var storagePath = args.GetValueOrDefault("--storage-path");
        var cellKey = args.GetValueOrDefault("--cell-key");

        var services = CreateServices(connection, storagePath, cellKey);
        var importService = services.GetRequiredService<MigrationImportService>();

        Console.WriteLine($"Importing bundle '{bundle}' (DryRun={dryRun}, VerifyOnly={verifyOnly})...");
        var result = await importService.ImportAsync(
            bundlePath: bundle,
            bundlePassphrase: passphrase,
            trustedSignerPublicKeyPemOrBase64: trustedKey,
            dryRun: dryRun,
            verifyOnly: verifyOnly,
            allowOverwrite: allowOverwrite);

        Console.WriteLine($"Import completed successfully for tenant '{result.TenantId}'.");
        Console.WriteLine($"Verified Counts: {JsonSerializer.Serialize(result.VerifiedCounts)}");
        return MigrationExitCodes.Success;
    }

    private static async Task<int> HandleVerifyAsync(Dictionary<string, string> args)
    {
        if (!args.TryGetValue("--bundle", out var bundle) || string.IsNullOrWhiteSpace(bundle))
        {
            Console.Error.WriteLine("Error: Missing required argument '--bundle'.");
            return MigrationExitCodes.ArgumentError;
        }

        var passphrase = args.GetValueOrDefault("--bundle-passphrase")
            ?? args.GetValueOrDefault("--passphrase")
            ?? Environment.GetEnvironmentVariable("COMMS_MIGRATION_PASSPHRASE");

        var trustedKey = await ResolveKeyAsync(args.GetValueOrDefault("--trusted-signer-key"), "COMMS_MIGRATION_TRUSTED_SIGNER_KEY");

        var verifyService = new MigrationVerifyService(new AttachmentCryptoService(new ConfigurationBuilder().Build()));
        var report = await verifyService.VerifyAsync(bundle, passphrase, trustedKey);

        if (!report.IsValid)
        {
            Console.Error.WriteLine($"Verification failed: {report.FailureReason}");
            return report.FailureReason?.Contains("signature", StringComparison.OrdinalIgnoreCase) == true
                ? MigrationExitCodes.SignatureFailure
                : MigrationExitCodes.ChecksumMismatch;
        }

        Console.WriteLine($"Bundle '{bundle}' is 100% valid.");
        Console.WriteLine($"Tenant: {report.TenantId}, Datasets: {report.TotalDatasets}, Attachments: {report.TotalAttachments}");
        return MigrationExitCodes.Success;
    }

    private static async Task<int> HandleInspectAsync(Dictionary<string, string> args)
    {
        if (!args.TryGetValue("--bundle", out var bundle) || string.IsNullOrWhiteSpace(bundle))
        {
            Console.Error.WriteLine("Error: Missing required argument '--bundle'.");
            return MigrationExitCodes.ArgumentError;
        }

        var manifest = await MigrationVerifyService.InspectAsync(bundle);
        Console.WriteLine(JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }));
        return MigrationExitCodes.Success;
    }

    private static ServiceProvider BuildServiceProvider(string? connection, string? storagePath, string? cellKey)
    {
        var services = new ServiceCollection();

        var configBuilder = new ConfigurationBuilder();
        var initialData = new Dictionary<string, string?>();

        if (!string.IsNullOrWhiteSpace(connection))
            initialData["ConnectionStrings:DefaultConnection"] = connection;
        if (!string.IsNullOrWhiteSpace(storagePath))
            initialData["Storage:BasePath"] = storagePath;
        if (!string.IsNullOrWhiteSpace(cellKey))
            initialData["Storage:MasterSecret"] = cellKey;

        configBuilder.AddInMemoryCollection(initialData);
        var configuration = configBuilder.Build();

        services.AddLogging(b => b.AddConsole());
        services.AddSingleton<IConfiguration>(configuration);

        var defaultConn = connection ?? "Host=localhost;Port=5432;Database=CLINICEZ_COMMS_DB;Username=clinicez;Password=clinicez";
        services.AddDbContext<CommsDbContext>(options =>
        {
            options.UseNpgsql(defaultConn);
        });

        services.AddScoped<ICommsDbContext>(sp => sp.GetRequiredService<CommsDbContext>());
        services.AddSingleton<ITenantMigrationGate, TenantMigrationGate>();
        services.AddScoped<ICommsStorageService, LocalCommsStorageService>();
        services.AddScoped<IAttachmentCryptoService, AttachmentCryptoService>();
        services.AddScoped<IOutboxDrainService, OutboxDrainService>();
        services.AddScoped<MigrationExportService>();
        services.AddScoped<MigrationImportService>();
        services.AddScoped<MigrationVerifyService>();

        return services.BuildServiceProvider();
    }

    public static Func<string?, string?, string?, IServiceProvider>? ServiceProviderFactory { get; set; }

    private static IServiceProvider CreateServices(string? connection, string? storagePath, string? cellKey)
    {
        return ServiceProviderFactory?.Invoke(connection, storagePath, cellKey)
            ?? BuildServiceProvider(connection, storagePath, cellKey);
    }

    private static readonly HashSet<string> ValueBearingOptions = new(StringComparer.OrdinalIgnoreCase)
    {
        "tenant", "t",
        "output", "o",
        "connection", "c",
        "storage-path",
        "cell-key",
        "bundle-passphrase", "passphrase", "p",
        "signer-key",
        "trusted-signer-key",
        "bundle", "b",
        "schema-version"
    };

    private static readonly HashSet<string> BooleanFlags = new(StringComparer.OrdinalIgnoreCase)
    {
        "dry-run",
        "verify-only",
        "allow-overwrite",
        "verbose"
    };

    private static bool IsOptionSwitch(string token)
    {
        if (string.IsNullOrEmpty(token)) return false;
        if (token.StartsWith("-----")) return false; // PEM headers (e.g. -----BEGIN ...) are values, not switches
        return token.StartsWith('-');
    }

    public static Dictionary<string, string> ParseArgs(string[] args)
    {
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < args.Length; i++)
        {
            var token = args[i];
            if (string.IsNullOrWhiteSpace(token))
                continue;

            if (!IsOptionSwitch(token))
                continue;

            // Handle --key=value
            if (token.Contains('='))
            {
                var parts = token.Split('=', 2);
                var rawKey = parts[0];
                var optName = rawKey.TrimStart('-');
                var val = parts[1];
                dict[rawKey] = val;
                dict["--" + optName] = val;
                dict[optName] = val;
                continue;
            }

            var flagName = token.TrimStart('-');
            if (ValueBearingOptions.Contains(flagName))
            {
                if (i + 1 < args.Length)
                {
                    var val = args[i + 1];
                    dict[token] = val;
                    dict["--" + flagName] = val;
                    dict[flagName] = val;
                    i++;
                }
                else
                {
                    dict[token] = string.Empty;
                    dict["--" + flagName] = string.Empty;
                    dict[flagName] = string.Empty;
                }
            }
            else if (BooleanFlags.Contains(flagName))
            {
                dict[token] = "true";
                dict["--" + flagName] = "true";
                dict[flagName] = "true";
            }
            else
            {
                // For any other switch: if next token is value-like (not a switch), consume it; else treat as boolean flag
                if (i + 1 < args.Length && !IsOptionSwitch(args[i + 1]))
                {
                    var val = args[i + 1];
                    dict[token] = val;
                    dict["--" + flagName] = val;
                    dict[flagName] = val;
                    i++;
                }
                else
                {
                    dict[token] = "true";
                    dict["--" + flagName] = "true";
                    dict[flagName] = "true";
                }
            }
        }
        return dict;
    }

    private static async Task<string?> ResolveKeyAsync(string? keyOrPath, string? envVarName = null, CancellationToken ct = default)
    {
        var val = keyOrPath;
        if (string.IsNullOrWhiteSpace(val) && !string.IsNullOrWhiteSpace(envVarName))
        {
            val = Environment.GetEnvironmentVariable(envVarName);
        }

        if (string.IsNullOrWhiteSpace(val))
        {
            return null;
        }

        val = val.Trim();
        // Check if value is a path to an existing file
        if (!val.Contains('\n') && !val.Contains("-----BEGIN") && File.Exists(val))
        {
            val = await File.ReadAllTextAsync(val, ct);
        }

        return PemKey.Normalize(val, envVarName ?? "Key");
    }

    private static void PrintUsage()
    {
        Console.WriteLine(@"ClinicEZ Comms Tenant Migration Tool (ClinicEz.Comms.MigrationTool)

Usage:
  comms-migrate export --tenant <id> [--output <path>] [--connection <db>] [--storage-path <path>] [--cell-key <key>] [--bundle-passphrase <secret>] [--signer-key <pem|path>] [--dry-run]
  comms-migrate import --bundle <path> [--connection <db>] [--storage-path <path>] [--cell-key <key>] [--bundle-passphrase <secret>] [--trusted-signer-key <pem|path>] [--dry-run] [--verify-only] [--allow-overwrite]
  comms-migrate verify --bundle <path> [--bundle-passphrase <secret>] [--trusted-signer-key <pem|path>]
  comms-migrate inspect --bundle <path>

Exit Codes:
  0 - Success
  1 - Argument Error
  2 - Signature Failure
  3 - Checksum Mismatch
  4 - Database Conflict
  5 - I/O or Cryptographic Failure");
    }
}
