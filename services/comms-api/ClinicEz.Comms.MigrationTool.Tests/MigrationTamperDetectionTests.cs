using System;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.MigrationTool.Services;
using ClinicEz.Comms.MigrationTool.Tests.Helpers;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Comms.MigrationTool.Tests;

public class MigrationTamperDetectionTests : IDisposable
{
    private readonly MigrationTestFixture _fixture = new();

    private async Task<string> CreateValidBundleAsync(string tenantId)
    {
        var sourceDb = _fixture.CreateDbContext("source_tamper_" + Guid.NewGuid().ToString("N"));
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, $"tamper_{Guid.NewGuid():N}.clinicez-comms-bundle");
        var exportService = new MigrationExportService(sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);

        await exportService.ExportAsync(
            tenantId,
            bundlePath,
            _fixture.MigrationPassphrase,
            _fixture.SignerPrivateKeyPem);

        return bundlePath;
    }

    [Fact]
    public async Task Import_RejectsBundle_WhenManifestSignatureTampered()
    {
        const string tenantId = "tenant-tamper-sig";
        var bundlePath = await CreateValidBundleAsync(tenantId);

        // Tamper 1 byte in bundle-signature.sig
        var tamperedPath = Path.Combine(_fixture.BundlesDirectory, "tampered-sig.zip");
        using (var sourceZip = ZipFile.OpenRead(bundlePath))
        using (var destZip = ZipFile.Open(tamperedPath, ZipArchiveMode.Create))
        {
            foreach (var entry in sourceZip.Entries)
            {
                var newEntry = destZip.CreateEntry(entry.FullName);
                using var inStream = entry.Open();
                using var outStream = newEntry.Open();

                if (entry.FullName == "bundle-signature.sig")
                {
                    using var ms = new MemoryStream();
                    inStream.CopyTo(ms);
                    var bytes = ms.ToArray();
                    // Flip 1 character
                    bytes[0] = bytes[0] == (byte)'A' ? (byte)'B' : (byte)'A';
                    outStream.Write(bytes);
                }
                else
                {
                    inStream.CopyTo(outStream);
                }
            }
        }

        var targetDb = _fixture.CreateDbContext("target_tamper_sig_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();

        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        // Act & Assert
        await Assert.ThrowsAsync<CryptographicException>(() =>
            importService.ImportAsync(tamperedPath, _fixture.MigrationPassphrase, _fixture.SignerPublicKeyPem));

        // Confirm 0 rows written
        var convCount = await targetDb.Conversations.IgnoreQueryFilters().CountAsync();
        Assert.Equal(0, convCount);
    }

    [Fact]
    public async Task Import_RejectsBundle_WhenManifestJsonTampered()
    {
        const string tenantId = "tenant-tamper-manifest";
        var bundlePath = await CreateValidBundleAsync(tenantId);

        var tamperedPath = Path.Combine(_fixture.BundlesDirectory, "tampered-manifest.zip");
        using (var sourceZip = ZipFile.OpenRead(bundlePath))
        using (var destZip = ZipFile.Open(tamperedPath, ZipArchiveMode.Create))
        {
            foreach (var entry in sourceZip.Entries)
            {
                var newEntry = destZip.CreateEntry(entry.FullName);
                using var inStream = entry.Open();
                using var outStream = newEntry.Open();

                if (entry.FullName == "bundle-manifest.json")
                {
                    using var reader = new StreamReader(inStream);
                    var text = reader.ReadToEnd();
                    // Alter schema version or tenant in manifest
                    var tampered = text.Replace("20261026144020", "20261026144021");
                    var bytes = Encoding.UTF8.GetBytes(tampered);
                    outStream.Write(bytes);
                }
                else
                {
                    inStream.CopyTo(outStream);
                }
            }
        }

        var targetDb = _fixture.CreateDbContext("target_tamper_manifest_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();

        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        await Assert.ThrowsAsync<CryptographicException>(() =>
            importService.ImportAsync(tamperedPath, _fixture.MigrationPassphrase, _fixture.SignerPublicKeyPem));

        var convCount = await targetDb.Conversations.IgnoreQueryFilters().CountAsync();
        Assert.Equal(0, convCount);
    }

    [Fact]
    public async Task Import_RejectsBundle_WhenEntityDatasetJsonTampered()
    {
        const string tenantId = "tenant-tamper-dataset";
        var bundlePath = await CreateValidBundleAsync(tenantId);

        var tamperedPath = Path.Combine(_fixture.BundlesDirectory, "tampered-dataset.zip");
        using (var sourceZip = ZipFile.OpenRead(bundlePath))
        using (var destZip = ZipFile.Open(tamperedPath, ZipArchiveMode.Create))
        {
            foreach (var entry in sourceZip.Entries)
            {
                var newEntry = destZip.CreateEntry(entry.FullName);
                using var inStream = entry.Open();
                using var outStream = newEntry.Open();

                if (entry.FullName == "data/messages.json")
                {
                    using var reader = new StreamReader(inStream);
                    var text = reader.ReadToEnd();
                    // Alter 1 character in message content text
                    var tampered = text.Replace("Morning clinical huddle", "Hacked clinical huddle");
                    var bytes = Encoding.UTF8.GetBytes(tampered);
                    outStream.Write(bytes);
                }
                else
                {
                    inStream.CopyTo(outStream);
                }
            }
        }

        var targetDb = _fixture.CreateDbContext("target_tamper_dataset_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();

        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        // SHA-256 dataset integrity failure
        var ex = await Assert.ThrowsAsync<CryptographicException>(() =>
            importService.ImportAsync(tamperedPath, _fixture.MigrationPassphrase, _fixture.SignerPublicKeyPem));

        Assert.Contains("messages", ex.Message, StringComparison.OrdinalIgnoreCase);

        var msgCount = await targetDb.Messages.IgnoreQueryFilters().CountAsync();
        Assert.Equal(0, msgCount);
    }

    [Fact]
    public async Task Import_RejectsBundle_WhenAttachmentBinaryTampered()
    {
        const string tenantId = "tenant-tamper-attachment";
        var bundlePath = await CreateValidBundleAsync(tenantId);

        var tamperedPath = Path.Combine(_fixture.BundlesDirectory, "tampered-attachment.zip");
        using (var sourceZip = ZipFile.OpenRead(bundlePath))
        using (var destZip = ZipFile.Open(tamperedPath, ZipArchiveMode.Create))
        {
            foreach (var entry in sourceZip.Entries)
            {
                var newEntry = destZip.CreateEntry(entry.FullName);
                using var inStream = entry.Open();
                using var outStream = newEntry.Open();

                if (entry.FullName.StartsWith("attachments/", StringComparison.OrdinalIgnoreCase))
                {
                    using var ms = new MemoryStream();
                    inStream.CopyTo(ms);
                    var bytes = ms.ToArray();
                    // Corrupt 1 byte in the ciphertext payload
                    bytes[0] ^= 0xFF;
                    outStream.Write(bytes);
                }
                else
                {
                    inStream.CopyTo(outStream);
                }
            }
        }

        var targetDb = _fixture.CreateDbContext("target_tamper_attachment_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();

        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        // AES-GCM tag mismatch or checksum error
        await Assert.ThrowsAnyAsync<CryptographicException>(() =>
            importService.ImportAsync(tamperedPath, _fixture.MigrationPassphrase, _fixture.SignerPublicKeyPem));

        var attCount = await targetDb.MessageAttachments.IgnoreQueryFilters().CountAsync();
        Assert.Equal(0, attCount);
    }

    public void Dispose() => _fixture.Dispose();
}
