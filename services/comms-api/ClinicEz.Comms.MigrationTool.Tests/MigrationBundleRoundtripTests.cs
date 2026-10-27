using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.MigrationTool.Services;
using ClinicEz.Comms.MigrationTool.Tests.Helpers;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Comms.MigrationTool.Tests;

public class MigrationBundleRoundtripTests : IDisposable
{
    private readonly MigrationTestFixture _fixture = new();

    [Fact]
    public async Task FullRoundtrip_PreservesAllEntitiesSequencesAndAttachmentPlainChecksum()
    {
        // Arrange
        const string tenantId = "tenant-stlukes-bgc";
        var sourceDb = _fixture.CreateDbContext("source_roundtrip_db");
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, "roundtrip.clinicez-comms-bundle");
        var exportService = new MigrationExportService(
            sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);

        // Act - 1. Export
        var exportResult = await exportService.ExportAsync(
            tenantId: tenantId,
            outputPath: bundlePath,
            bundlePassphrase: _fixture.MigrationPassphrase,
            signerPrivateKeyPemOrBase64: _fixture.SignerPrivateKeyPem);

        Assert.True(File.Exists(bundlePath));
        Assert.Equal(2, exportResult.RecordCounts["conversations"]);
        Assert.Equal(3, exportResult.RecordCounts["participants"]);
        Assert.Equal(2, exportResult.RecordCounts["messages"]);
        Assert.Equal(1, exportResult.RecordCounts["messageReactions"]);
        Assert.Equal(1, exportResult.RecordCounts["attachmentsMetadata"]);
        Assert.Equal(1, exportResult.RecordCounts["attachmentsPayloads"]);
        Assert.Equal(1, exportResult.RecordCounts["eligibilityGrants"]);
        Assert.Equal(1, exportResult.RecordCounts["guestInvites"]);

        // Act - 2. Import into clean target DB with DIFFERENT Cell Master Key!
        var targetDb = _fixture.CreateDbContext("target_roundtrip_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret); // Different key!
        var targetGate = new TenantMigrationGate();

        var importService = new MigrationImportService(
            targetDb, targetStorage, targetCrypto, targetGate);

        var importResult = await importService.ImportAsync(
            bundlePath: bundlePath,
            bundlePassphrase: _fixture.MigrationPassphrase,
            trustedSignerPublicKeyPemOrBase64: _fixture.SignerPublicKeyPem);

        // Assert
        Assert.True(importResult.IsSuccess);
        Assert.False(importResult.IsDryRun);
        Assert.Equal(tenantId, importResult.TenantId);

        // Verify target database rows
        var targetConvs = await targetDb.Conversations.IgnoreQueryFilters().Where(c => c.TenantId == tenantId).ToListAsync();
        Assert.Equal(2, targetConvs.Count);
        var conv1 = targetConvs.Single(c => c.Kind == ClinicEz.Shared.Interop.Contracts.ConversationKind.General);
        Assert.Equal("General Facility Chat", conv1.Title);
        Assert.Equal(5, conv1.LastSeq);

        var targetMsgs = await targetDb.Messages.IgnoreQueryFilters().Where(m => m.TenantId == tenantId).OrderBy(m => m.Seq).ToListAsync();
        Assert.Equal(2, targetMsgs.Count);
        Assert.Equal(1, targetMsgs[0].Seq);
        Assert.Equal("Morning clinical huddle at 9am.", targetMsgs[0].ContentText);
        Assert.Equal(2, targetMsgs[1].Seq);
        Assert.Equal("Noted Doc, charts are ready.", targetMsgs[1].ContentText);

        var targetReactions = await targetDb.MessageReactions.IgnoreQueryFilters().ToListAsync();
        Assert.Single(targetReactions);
        Assert.Equal("thumbs_up", targetReactions[0].Reaction);

        var targetAttachments = await targetDb.MessageAttachments.IgnoreQueryFilters().Where(a => a.TenantId == tenantId).ToListAsync();
        Assert.Single(targetAttachments);
        var targetAtt = targetAttachments[0];

        // Critical Check: Plaintext SHA256 invariant must match identically
        var sourceAtt = await sourceDb.MessageAttachments.IgnoreQueryFilters().SingleAsync(a => a.TenantId == tenantId);
        Assert.Equal(sourceAtt.SHA256Checksum, targetAtt.SHA256Checksum);
        Assert.Equal(sourceAtt.Id, targetAtt.Id);

        // Critical Check: Verify target storage file exists and decrypts cleanly with Target CMK!
        var targetCiphertext = await targetStorage.ReadEncryptedAttachmentAsync(targetAtt.StoragePath);
        Assert.NotNull(targetCiphertext);

        var targetMetadata = new AttachmentCryptoMetadata(
            targetAtt.EncryptionAlgorithm,
            targetAtt.EncryptionKeyId,
            targetAtt.EncryptionIvBase64,
            targetAtt.EncryptionTagBase64,
            targetAtt.WrappedKeyJson);

        var targetDecrypted = await targetCrypto.DecryptAsync(targetCiphertext, targetMetadata, tenantId, targetAtt.FacilityId);
        var actualDecryptedText = Encoding.UTF8.GetString(targetDecrypted);
        Assert.Equal("CONFIDENTIAL_CLINICAL_ATTACHMENT_DATA_FOR_MIGRATION_VERIFICATION", actualDecryptedText);

        var actualDecryptedSha256 = Convert.ToHexString(SHA256.HashData(targetDecrypted)).ToLowerInvariant();
        Assert.Equal(targetAtt.SHA256Checksum, actualDecryptedSha256);

        // Verify outbox entry imported with DispatchedAtUtc set (zero duplicate relay)
        var targetOutbox = await targetDb.InteropOutbox.ToListAsync();
        Assert.Single(targetOutbox);
        Assert.NotNull(targetOutbox[0].DispatchedAtUtc);
    }

    public void Dispose() => _fixture.Dispose();
}
