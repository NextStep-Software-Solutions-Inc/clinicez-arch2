using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading.Tasks;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.MigrationTool.Services;
using ClinicEz.Comms.MigrationTool.Tests.Helpers;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Comms.MigrationTool.Tests;

public class MigrationAtomicRollbackTests : IDisposable
{
    private readonly MigrationTestFixture _fixture = new();

    [Fact]
    public async Task AbortedExport_UnlocksSourceTenantAndLeavesDatabaseUntouched()
    {
        const string tenantId = "tenant-export-abort";
        var sourceDb = _fixture.CreateDbContext("source_abort_db");
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var initialConvCount = await sourceDb.Conversations.IgnoreQueryFilters().CountAsync();
        var initialMsgCount = await sourceDb.Messages.IgnoreQueryFilters().CountAsync();

        var exportService = new MigrationExportService(sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);

        // Intentionally trigger failure by passing invalid/malformed signer key
        await Assert.ThrowsAnyAsync<Exception>(() =>
            exportService.ExportAsync(
                tenantId,
                Path.Combine(_fixture.BundlesDirectory, "invalid.zip"),
                _fixture.MigrationPassphrase,
                "NOT_A_VALID_PEM_KEY"));

        // Assert: source lock transitions to Aborted
        var state = sourceGate.GetState(tenantId);
        Assert.NotNull(state);
        Assert.Equal(MigrationLifecycleState.Aborted, state.State);
        Assert.False(state.IsLockedForMigration);

        // Assert: Source database rows are 100% untouched
        var finalConvCount = await sourceDb.Conversations.IgnoreQueryFilters().CountAsync();
        var finalMsgCount = await sourceDb.Messages.IgnoreQueryFilters().CountAsync();
        Assert.Equal(initialConvCount, finalConvCount);
        Assert.Equal(initialMsgCount, finalMsgCount);
    }

    [Fact]
    public async Task AbortedImport_RollsBackTargetDatabaseCleanlyAndScrubsFiles()
    {
        const string tenantId = "tenant-rollback-target";
        var sourceDb = _fixture.CreateDbContext("source_for_target_abort_db");
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, "rollback-test.clinicez-comms-bundle");
        var exportService = new MigrationExportService(sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);
        await exportService.ExportAsync(tenantId, bundlePath, _fixture.MigrationPassphrase, _fixture.SignerPrivateKeyPem);

        var targetDb = _fixture.CreateDbContext("target_rollback_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        // Using wrong passphrase to trigger decryption failure mid-import
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();

        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        await Assert.ThrowsAnyAsync<CryptographicException>(() =>
            importService.ImportAsync(
                bundlePath,
                "WRONG_PASSPHRASE_12345",
                _fixture.SignerPublicKeyPem));

        // Assert: Target DB transaction rolled back completely (0 rows)
        var targetConvs = await targetDb.Conversations.IgnoreQueryFilters().CountAsync();
        var targetMsgs = await targetDb.Messages.IgnoreQueryFilters().CountAsync();
        var targetAtts = await targetDb.MessageAttachments.IgnoreQueryFilters().CountAsync();

        Assert.Equal(0, targetConvs);
        Assert.Equal(0, targetMsgs);
        Assert.Equal(0, targetAtts);

        // Assert: Target staging storage has zero leftover files
        var storageFiles = Directory.GetFiles(_fixture.TargetStorageDirectory, "*.*", SearchOption.AllDirectories);
        Assert.Empty(storageFiles);

        // Assert: Tenant state is Aborted and not locked
        var targetState = targetGate.GetState(tenantId);
        Assert.NotNull(targetState);
        Assert.Equal(MigrationLifecycleState.Aborted, targetState.State);
        Assert.False(targetState.IsLockedForMigration);
    }

    [Fact]
    public async Task DryRunExport_DoesNotWriteBundleFileToDisk()
    {
        const string tenantId = "tenant-dryrun-export";
        var sourceDb = _fixture.CreateDbContext("source_dryrun_exp_db");
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, "dryrun-export.clinicez-comms-bundle");
        var exportService = new MigrationExportService(sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);

        // Act
        var result = await exportService.ExportAsync(
            tenantId,
            bundlePath,
            _fixture.MigrationPassphrase,
            _fixture.SignerPrivateKeyPem,
            dryRun: true);

        // Assert
        Assert.True(result.IsDryRun);
        Assert.False(File.Exists(bundlePath)); // File was NOT written

        var state = sourceGate.GetState(tenantId);
        Assert.NotNull(state);
        Assert.Equal(MigrationLifecycleState.Idle, state.State);
    }

    [Fact]
    public async Task DryRunImport_LeavesTargetDatabaseUntouched()
    {
        const string tenantId = "tenant-dryrun-import";
        var sourceDb = _fixture.CreateDbContext("source_dryrun_imp_db");
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, "dryrun-import.clinicez-comms-bundle");
        var exportService = new MigrationExportService(sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);
        await exportService.ExportAsync(tenantId, bundlePath, _fixture.MigrationPassphrase, _fixture.SignerPrivateKeyPem);

        var targetDb = _fixture.CreateDbContext("target_dryrun_imp_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();

        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        // Act
        var result = await importService.ImportAsync(
            bundlePath,
            _fixture.MigrationPassphrase,
            _fixture.SignerPublicKeyPem,
            dryRun: true);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.True(result.IsDryRun);

        // Target DB has 0 rows committed
        var targetConvs = await targetDb.Conversations.IgnoreQueryFilters().CountAsync();
        Assert.Equal(0, targetConvs);

        var targetMsgs = await targetDb.Messages.IgnoreQueryFilters().CountAsync();
        Assert.Equal(0, targetMsgs);

        // Target storage is clean
        var targetFiles = Directory.GetFiles(_fixture.TargetStorageDirectory, "*.*", SearchOption.AllDirectories);
        Assert.Empty(targetFiles);
    }

    [Fact]
    public async Task DatabaseCollision_AbortsWithoutOverwritingUnlessExplicitlyRequested()
    {
        const string tenantId = "tenant-collision-test";
        var sourceDb = _fixture.CreateDbContext("source_collision_db");
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, "collision.clinicez-comms-bundle");
        var exportService = new MigrationExportService(sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);
        await exportService.ExportAsync(tenantId, bundlePath, _fixture.MigrationPassphrase, _fixture.SignerPrivateKeyPem);

        var targetDb = _fixture.CreateDbContext("target_collision_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();

        // Seed conflicting conversation in target
        targetDb.Conversations.Add(new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = "fac-01",
            Title = "Conflicting Existing Conversation"
        });
        await targetDb.SaveChangesAsync();

        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        // 1. Without allowOverwrite: throws collision exception
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            importService.ImportAsync(
                bundlePath,
                _fixture.MigrationPassphrase,
                _fixture.SignerPublicKeyPem,
                allowOverwrite: false));

        Assert.Contains("collision", ex.Message, StringComparison.OrdinalIgnoreCase);

        // Existing data remains
        var convCount = await targetDb.Conversations.IgnoreQueryFilters().CountAsync(c => c.TenantId == tenantId);
        Assert.Equal(1, convCount);

        // 2. With allowOverwrite: succeeds and replaces data cleanly
        var overwriteResult = await importService.ImportAsync(
            bundlePath,
            _fixture.MigrationPassphrase,
            _fixture.SignerPublicKeyPem,
            allowOverwrite: true);

        Assert.True(overwriteResult.IsSuccess);
        var newConvCount = await targetDb.Conversations.IgnoreQueryFilters().CountAsync(c => c.TenantId == tenantId);
        Assert.Equal(2, newConvCount); // Seed bundle has 2 conversations
    }

    public void Dispose() => _fixture.Dispose();
}
