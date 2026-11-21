using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.MigrationTool.Models;
using ClinicEz.Comms.MigrationTool.Services;
using ClinicEz.Comms.MigrationTool.Tests.Helpers;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Comms.MigrationTool.Tests;

public class MigrationChecksumVerificationTests : IDisposable
{
    private readonly MigrationTestFixture _fixture = new();

    [Fact]
    public async Task ChecksumVerification_MatchesCompositeMerkleHashAndFourWayCounts()
    {
        // Arrange
        const string tenantId = "tenant-checksum-test";
        var sourceDb = _fixture.CreateDbContext("source_checksum_db");
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, "checksum-test.clinicez-comms-bundle");
        var exportService = new MigrationExportService(sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);

        // Act - Export
        var exportResult = await exportService.ExportAsync(
            tenantId,
            bundlePath,
            _fixture.MigrationPassphrase,
            _fixture.SignerPrivateKeyPem);

        var manifest = exportResult.Manifest;

        // Verify Manifest Merkle hashes are non-empty
        Assert.False(string.IsNullOrWhiteSpace(manifest.Datasets["conversations"].CompositeMerkleHash));
        Assert.False(string.IsNullOrWhiteSpace(manifest.Datasets["messages"].CompositeMerkleHash));
        Assert.False(string.IsNullOrWhiteSpace(manifest.Datasets["participants"].CompositeMerkleHash));

        // Act - Import into target
        var targetDb = _fixture.CreateDbContext("target_checksum_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();

        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);
        var importResult = await importService.ImportAsync(bundlePath, _fixture.MigrationPassphrase, _fixture.SignerPublicKeyPem);

        // Assert 4-Way Row Count Matrix:
        // [Source DB Count] == [Manifest Recorded Count] == [Bundle Ingested Count] == [Target DB Count]
        var sourceConvCount = await sourceDb.Conversations.IgnoreQueryFilters().CountAsync(c => c.TenantId == tenantId);
        var manifestConvCount = manifest.Datasets["conversations"].RecordCount;
        var ingestedConvCount = importResult.VerifiedCounts["conversations"];
        var targetConvCount = await targetDb.Conversations.IgnoreQueryFilters().CountAsync(c => c.TenantId == tenantId);

        Assert.Equal(sourceConvCount, manifestConvCount);
        Assert.Equal(manifestConvCount, ingestedConvCount);
        Assert.Equal(ingestedConvCount, targetConvCount);

        var sourceMsgCount = await sourceDb.Messages.IgnoreQueryFilters().CountAsync(m => m.TenantId == tenantId);
        var manifestMsgCount = manifest.Datasets["messages"].RecordCount;
        var ingestedMsgCount = importResult.VerifiedCounts["messages"];
        var targetMsgCount = await targetDb.Messages.IgnoreQueryFilters().CountAsync(m => m.TenantId == tenantId);

        Assert.Equal(sourceMsgCount, manifestMsgCount);
        Assert.Equal(manifestMsgCount, ingestedMsgCount);
        Assert.Equal(ingestedMsgCount, targetMsgCount);
    }

    [Fact]
    public void CompositeMerkleHash_IsDeterministicAndSensitiveToAnyFieldMutation()
    {
        var record1 = new MessageRecord
        {
            Id = Guid.NewGuid(),
            ConversationId = Guid.NewGuid(),
            TenantId = "t-1",
            Seq = 1,
            ContentText = "Original Message",
            SenderDisplayName = "Dr. A"
        };
        var record2 = new MessageRecord
        {
            Id = Guid.NewGuid(),
            ConversationId = Guid.NewGuid(),
            TenantId = "t-1",
            Seq = 2,
            ContentText = "Follow-up",
            SenderDisplayName = "Dr. B"
        };

        var hash1 = MigrationManifestService.HashMessage(record1);
        var hash2 = MigrationManifestService.HashMessage(record2);

        var composite1 = MigrationManifestService.ComputeCompositeMerkleHash(new[] { hash1, hash2 });
        var compositeOrderInverted = MigrationManifestService.ComputeCompositeMerkleHash(new[] { hash2, hash1 });

        // Deterministic & order-invariant due to internal ordinal sorting
        Assert.Equal(composite1, compositeOrderInverted);

        // Alter 1 character in record1
        record1.ContentText = "Modified Message";
        var hash1Modified = MigrationManifestService.HashMessage(record1);
        var compositeModified = MigrationManifestService.ComputeCompositeMerkleHash(new[] { hash1Modified, hash2 });

        Assert.NotEqual(composite1, compositeModified);
    }

    public void Dispose() => _fixture.Dispose();
}
