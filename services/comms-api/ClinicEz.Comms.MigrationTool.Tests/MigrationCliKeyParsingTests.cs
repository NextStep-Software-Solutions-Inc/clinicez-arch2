using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.MigrationTool.Models;
using ClinicEz.Comms.MigrationTool.Services;
using ClinicEz.Comms.MigrationTool.Tests.Helpers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ClinicEz.Comms.MigrationTool.Tests;

public class MigrationCliKeyParsingTests : IDisposable
{
    private readonly MigrationTestFixture _fixture = new();

    public MigrationCliKeyParsingTests()
    {
        Program.ServiceProviderFactory = (connection, storagePath, cellKey) =>
        {
            var services = new ServiceCollection();
            var dbName = connection?.StartsWith("InMemory:", StringComparison.OrdinalIgnoreCase) == true
                ? connection["InMemory:".Length..]
                : "test_db_" + Guid.NewGuid().ToString("N");

            services.AddDbContext<CommsDbContext>(opts =>
            {
                opts.UseInMemoryDatabase(dbName);
            });

            services.AddScoped<ICommsDbContext>(sp => sp.GetRequiredService<CommsDbContext>());
            services.AddSingleton<ITenantMigrationGate, TenantMigrationGate>();
            services.AddScoped<ICommsStorageService>(_ =>
                _fixture.CreateStorageService(storagePath ?? _fixture.SourceStorageDirectory));
            services.AddScoped<IAttachmentCryptoService>(_ =>
                _fixture.CreateCryptoService(cellKey ?? _fixture.SourceCellSecret));
            services.AddScoped<IOutboxDrainService, OutboxDrainService>();
            services.AddScoped<MigrationExportService>();
            services.AddScoped<MigrationImportService>();
            services.AddScoped<MigrationVerifyService>();

            return services.BuildServiceProvider();
        };
    }

    private async Task<string> CreateValidTestBundleAsync(string tenantId)
    {
        var sourceDb = _fixture.CreateDbContext("source_cli_key_" + Guid.NewGuid().ToString("N"));
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, $"cli_key_valid_{Guid.NewGuid():N}.clinicez-comms-bundle");
        var exportService = new MigrationExportService(sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);

        await exportService.ExportAsync(
            tenantId,
            bundlePath,
            _fixture.MigrationPassphrase,
            _fixture.SignerPrivateKeyPem);

        return bundlePath;
    }

    private static string CreateTamperedZip(string sourceZipPath, string targetZipPath, Action<string, byte[], Action<byte[]>> mutateEntry)
    {
        if (File.Exists(targetZipPath))
        {
            File.Delete(targetZipPath);
        }

        using (var sourceArchive = ZipFile.OpenRead(sourceZipPath))
        using (var destArchive = ZipFile.Open(targetZipPath, ZipArchiveMode.Create))
        {
            foreach (var entry in sourceArchive.Entries)
            {
                using var inStream = entry.Open();
                using var ms = new MemoryStream();
                inStream.CopyTo(ms);
                var bytes = ms.ToArray();

                var newEntry = destArchive.CreateEntry(entry.FullName);
                using var outStream = newEntry.Open();

                bool mutated = false;
                mutateEntry(entry.FullName, bytes, mutatedBytes =>
                {
                    outStream.Write(mutatedBytes);
                    mutated = true;
                });

                if (!mutated)
                {
                    outStream.Write(bytes);
                }
            }
        }

        return targetZipPath;
    }

    [Fact]
    public void ParseArgs_WithLiteralPemPublicAndPrivateKeys_CorrectlyCapturesValuesWithoutMistakingThemAsSwitches()
    {
        const string literalPubKey = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtest123\n-----END PUBLIC KEY-----";
        const string literalPrivKey = "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEtest456\n-----END EC PRIVATE KEY-----";

        var args = new[]
        {
            "verify",
            "--trusted-signer-key", literalPubKey,
            "--bundle", "bundle-123.zip",
            "--bundle-passphrase", "secretPass",
            "--signer-key", literalPrivKey,
            "--tenant", "t-test",
            "--dry-run"
        };

        var parsed = Program.ParseArgs(args);

        // Verify that PEM strings starting with '-----' are preserved as values, NOT treated as switches
        Assert.Equal(literalPubKey, parsed["--trusted-signer-key"]);
        Assert.Equal(literalPubKey, parsed["trusted-signer-key"]);
        Assert.Equal(literalPrivKey, parsed["--signer-key"]);
        Assert.Equal(literalPrivKey, parsed["signer-key"]);
        Assert.Equal("bundle-123.zip", parsed["--bundle"]);
        Assert.Equal("bundle-123.zip", parsed["bundle"]);
        Assert.Equal("secretPass", parsed["--bundle-passphrase"]);
        Assert.Equal("t-test", parsed["--tenant"]);
        Assert.Equal("true", parsed["--dry-run"]);
        Assert.False(parsed.ContainsKey("-----BEGIN PUBLIC KEY-----"));
        Assert.False(parsed.ContainsKey("-----BEGIN EC PRIVATE KEY-----"));
    }

    [Fact]
    public void ParseArgs_WithBooleanFlags_CorrectlyAssignsTrueWithoutConsumingSubsequentTokens()
    {
        var args = new[]
        {
            "--dry-run",
            "--bundle", "target.zip",
            "--verify-only",
            "--allow-overwrite",
            "--verbose"
        };

        var parsed = Program.ParseArgs(args);

        Assert.Equal("true", parsed["--dry-run"]);
        Assert.Equal("target.zip", parsed["--bundle"]);
        Assert.Equal("true", parsed["--verify-only"]);
        Assert.Equal("true", parsed["--allow-overwrite"]);
        Assert.Equal("true", parsed["--verbose"]);
    }

    [Fact]
    public void ParseArgs_WithEqualsSyntax_CorrectlyParsesKeyValues()
    {
        var args = new[]
        {
            "--bundle=my-bundle.zip",
            "--tenant=t-demo",
            "--output=out.bundle",
            "--dry-run"
        };

        var parsed = Program.ParseArgs(args);

        Assert.Equal("my-bundle.zip", parsed["--bundle"]);
        Assert.Equal("t-demo", parsed["--tenant"]);
        Assert.Equal("out.bundle", parsed["--output"]);
        Assert.Equal("true", parsed["--dry-run"]);
    }

    [Fact]
    public async Task CliVerify_WithLiteralPem_ValidBundle_VerifiesSuccessfully_ExitCode0()
    {
        const string tenantId = "tenant-cli-literal-pem";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);

        // Act: Pass literal PEM string starting with '-----BEGIN PUBLIC KEY-----'
        var exitCode = await Program.Main(new[]
        {
            "verify",
            "--bundle", bundlePath,
            "--bundle-passphrase", _fixture.MigrationPassphrase,
            "--trusted-signer-key", _fixture.SignerPublicKeyPem
        });

        // Assert: Exit code must be 0 (Success), NOT 5 (IoOrCryptoFailure)
        Assert.Equal(MigrationExitCodes.Success, exitCode);
    }

    [Fact]
    public async Task CliVerify_WithKeyFilePath_ValidBundle_VerifiesSuccessfully_ExitCode0()
    {
        const string tenantId = "tenant-cli-file-key";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);

        var keyFilePath = Path.Combine(_fixture.TempDirectory, "trusted_signer.pub.pem");
        await File.WriteAllTextAsync(keyFilePath, _fixture.SignerPublicKeyPem);

        // Act: Pass file path to --trusted-signer-key
        var exitCode = await Program.Main(new[]
        {
            "verify",
            "--bundle", bundlePath,
            "--bundle-passphrase", _fixture.MigrationPassphrase,
            "--trusted-signer-key", keyFilePath
        });

        // Assert: File path is read and key verifies bundle with exit code 0
        Assert.Equal(MigrationExitCodes.Success, exitCode);
    }

    [Fact]
    public async Task CliExport_WithSignerKeyFilePath_SignsBundleWithProvidedKey()
    {
        const string tenantId = "tenant-cli-export-filekey";
        var dbName = "export_filekey_db_" + Guid.NewGuid().ToString("N");
        var sourceDb = _fixture.CreateDbContext(dbName);
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var keyFilePath = Path.Combine(_fixture.TempDirectory, "export_signer.key.pem");
        await File.WriteAllTextAsync(keyFilePath, _fixture.SignerPrivateKeyPem);

        var outBundlePath = Path.Combine(_fixture.BundlesDirectory, $"exported_{Guid.NewGuid():N}.clinicez-comms-bundle");

        // Act: Pass key file path to --signer-key
        var exitCode = await Program.Main(new[]
        {
            "export",
            "--tenant", tenantId,
            "--output", outBundlePath,
            "--bundle-passphrase", _fixture.MigrationPassphrase,
            "--signer-key", keyFilePath,
            "--connection", $"InMemory:{dbName}",
            "--storage-path", _fixture.SourceStorageDirectory,
            "--cell-key", _fixture.SourceCellSecret,
            "--dry-run"
        });

        Assert.Equal(MigrationExitCodes.Success, exitCode);
    }

    [Fact]
    public async Task CliExport_WithLiteralPemSignerKey_SignsBundleWithProvidedKey()
    {
        const string tenantId = "tenant-cli-export-pem";
        var dbName = "export_pem_db_" + Guid.NewGuid().ToString("N");
        var sourceDb = _fixture.CreateDbContext(dbName);
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var outBundlePath = Path.Combine(_fixture.BundlesDirectory, $"exported_pem_{Guid.NewGuid():N}.clinicez-comms-bundle");

        // Act: Pass literal private key PEM to --signer-key
        var exitCode = await Program.Main(new[]
        {
            "export",
            "--tenant", tenantId,
            "--output", outBundlePath,
            "--bundle-passphrase", _fixture.MigrationPassphrase,
            "--signer-key", _fixture.SignerPrivateKeyPem,
            "--connection", $"InMemory:{dbName}",
            "--storage-path", _fixture.SourceStorageDirectory,
            "--cell-key", _fixture.SourceCellSecret,
            "--dry-run"
        });

        Assert.Equal(MigrationExitCodes.Success, exitCode);
    }

    [Fact]
    public async Task CliVerify_WithLiteralPem_TamperedSignature_ReturnsExitCode2_SignatureFailure()
    {
        const string tenantId = "tenant-cli-tamper-sig";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);

        var tamperedPath = Path.Combine(_fixture.BundlesDirectory, $"tampered_sig_{Guid.NewGuid():N}.clinicez-comms-bundle");
        CreateTamperedZip(bundlePath, tamperedPath, (name, bytes, writeMutated) =>
        {
            if (name == "bundle-signature.sig")
            {
                bytes[0] = bytes[0] == (byte)'A' ? (byte)'B' : (byte)'A';
                writeMutated(bytes);
            }
        });

        // Act: Pass literal PEM to --trusted-signer-key on tampered signature bundle
        var exitCode = await Program.Main(new[]
        {
            "verify",
            "--bundle", tamperedPath,
            "--bundle-passphrase", _fixture.MigrationPassphrase,
            "--trusted-signer-key", _fixture.SignerPublicKeyPem
        });

        // Assert: Must return Exit Code 2 (SignatureFailure), NEVER 5
        Assert.Equal(MigrationExitCodes.SignatureFailure, exitCode);
    }

    [Fact]
    public async Task CliVerify_WithKeyFilePath_TamperedSignature_ReturnsExitCode2_SignatureFailure()
    {
        const string tenantId = "tenant-cli-tamper-sig-file";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);

        var keyFilePath = Path.Combine(_fixture.TempDirectory, "trusted_sig_check.pub.pem");
        await File.WriteAllTextAsync(keyFilePath, _fixture.SignerPublicKeyPem);

        var tamperedPath = Path.Combine(_fixture.BundlesDirectory, $"tampered_sig_file_{Guid.NewGuid():N}.clinicez-comms-bundle");
        CreateTamperedZip(bundlePath, tamperedPath, (name, bytes, writeMutated) =>
        {
            if (name == "bundle-signature.sig")
            {
                bytes[0] = bytes[0] == (byte)'A' ? (byte)'B' : (byte)'A';
                writeMutated(bytes);
            }
        });

        // Act: Pass key file path to --trusted-signer-key
        var exitCode = await Program.Main(new[]
        {
            "verify",
            "--bundle", tamperedPath,
            "--bundle-passphrase", _fixture.MigrationPassphrase,
            "--trusted-signer-key", keyFilePath
        });

        // Assert: Must return Exit Code 2 (SignatureFailure)
        Assert.Equal(MigrationExitCodes.SignatureFailure, exitCode);
    }

    [Fact]
    public async Task CliVerify_WithLiteralPem_TamperedDataset_ReturnsExitCode3_ChecksumMismatch()
    {
        const string tenantId = "tenant-cli-tamper-dataset";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);

        var tamperedPath = Path.Combine(_fixture.BundlesDirectory, $"tampered_ds_{Guid.NewGuid():N}.clinicez-comms-bundle");
        CreateTamperedZip(bundlePath, tamperedPath, (name, bytes, writeMutated) =>
        {
            if (name.Equals("data/messages.json", StringComparison.OrdinalIgnoreCase))
            {
                var text = Encoding.UTF8.GetString(bytes);
                var tampered = text.Replace("Morning clinical huddle", "Tampered clinical huddle");
                writeMutated(Encoding.UTF8.GetBytes(tampered));
            }
        });

        // Act: Pass literal PEM to --trusted-signer-key on tampered data bundle
        var exitCode = await Program.Main(new[]
        {
            "verify",
            "--bundle", tamperedPath,
            "--bundle-passphrase", _fixture.MigrationPassphrase,
            "--trusted-signer-key", _fixture.SignerPublicKeyPem
        });

        // Assert: Must return Exit Code 3 (ChecksumMismatch), NEVER 5
        Assert.Equal(MigrationExitCodes.ChecksumMismatch, exitCode);
    }

    [Fact]
    public async Task CliVerify_WithWrongLiteralPemKey_ReturnsExitCode2_SignatureFailure()
    {
        const string tenantId = "tenant-cli-wrong-key";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);

        // Generate an unrelated valid P-256 public key
        using var otherEcdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var otherPublicKeyPem = otherEcdsa.ExportSubjectPublicKeyInfoPem();

        // Act: Pass unrelated key as --trusted-signer-key
        var exitCode = await Program.Main(new[]
        {
            "verify",
            "--bundle", bundlePath,
            "--bundle-passphrase", _fixture.MigrationPassphrase,
            "--trusted-signer-key", otherPublicKeyPem
        });

        // Assert: Verification must fail with Exit Code 2 (SignatureFailure), not 5
        Assert.Equal(MigrationExitCodes.SignatureFailure, exitCode);
    }

    [Fact]
    public async Task CliImport_WithLiteralPem_ValidBundleDryRun_ReturnsExitCode0()
    {
        const string tenantId = "tenant-cli-import-pem";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);
        var targetDbName = "target_import_pem_db_" + Guid.NewGuid().ToString("N");

        // Act: Run comms-migrate import with literal PEM in --trusted-signer-key and --dry-run
        var exitCode = await Program.Main(new[]
        {
            "import",
            "--bundle", bundlePath,
            "--bundle-passphrase", _fixture.MigrationPassphrase,
            "--trusted-signer-key", _fixture.SignerPublicKeyPem,
            "--connection", $"InMemory:{targetDbName}",
            "--storage-path", _fixture.TargetStorageDirectory,
            "--cell-key", _fixture.TargetCellSecret,
            "--dry-run"
        });

        // Assert: Exit code must be 0 (Success)
        Assert.Equal(MigrationExitCodes.Success, exitCode);
    }

    [Fact]
    public async Task CliImport_WithKeyFilePath_ValidBundleDryRun_ReturnsExitCode0()
    {
        const string tenantId = "tenant-cli-import-file";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);
        var targetDbName = "target_import_file_db_" + Guid.NewGuid().ToString("N");

        var keyFilePath = Path.Combine(_fixture.TempDirectory, "import_trusted.pub.pem");
        await File.WriteAllTextAsync(keyFilePath, _fixture.SignerPublicKeyPem);

        // Act: Run comms-migrate import with key file path in --trusted-signer-key and --dry-run
        var exitCode = await Program.Main(new[]
        {
            "import",
            "--bundle", bundlePath,
            "--bundle-passphrase", _fixture.MigrationPassphrase,
            "--trusted-signer-key", keyFilePath,
            "--connection", $"InMemory:{targetDbName}",
            "--storage-path", _fixture.TargetStorageDirectory,
            "--cell-key", _fixture.TargetCellSecret,
            "--dry-run"
        });

        // Assert: Exit code must be 0 (Success)
        Assert.Equal(MigrationExitCodes.Success, exitCode);
    }

    public void Dispose()
    {
        Program.ServiceProviderFactory = null;
        _fixture.Dispose();
    }
}
