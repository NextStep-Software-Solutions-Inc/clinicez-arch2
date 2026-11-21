using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.MigrationTool.Models;
using ClinicEz.Comms.MigrationTool.Services;
using ClinicEz.Comms.MigrationTool.Tests.Helpers;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Comms.MigrationTool.Tests;

public class ChallengerTamperAndChecksumTests : IDisposable
{
    private readonly MigrationTestFixture _fixture = new();

    private async Task<string> CreateValidTestBundleAsync(string tenantId)
    {
        var sourceDb = _fixture.CreateDbContext("source_challenger_" + Guid.NewGuid().ToString("N"));
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, $"valid_{Guid.NewGuid():N}.clinicez-comms-bundle");
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
    public async Task LegitimateBundle_VerifiesSuccessfully_ExitCode0()
    {
        const string tenantId = "tenant-challenger-valid";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);

        // Act 1: Verify command
        var verifyCode = await Program.Main(new[]
        {
            "verify",
            "--bundle", bundlePath,
            "--bundle-passphrase", _fixture.MigrationPassphrase,
            "--trusted-signer-key", _fixture.SignerPublicKeyPem
        });

        // Act 2: Inspect command
        var inspectCode = await Program.Main(new[]
        {
            "inspect",
            "--bundle", bundlePath
        });

        // Act 3: Verify Service Direct
        var verifyService = new MigrationVerifyService(new AttachmentCryptoService(_fixture.TargetCellSecret));
        var report = await verifyService.VerifyAsync(bundlePath, _fixture.MigrationPassphrase, _fixture.SignerPublicKeyPem);

        // Assert
        Assert.Equal(MigrationExitCodes.Success, verifyCode);
        Assert.Equal(MigrationExitCodes.Success, inspectCode);
        Assert.True(report.IsValid);
        Assert.Null(report.FailureReason);
        Assert.Equal(tenantId, report.TenantId);
        Assert.True(report.TotalDatasets > 0);
        Assert.True(report.TotalAttachments > 0);
    }

    [Fact]
    public async Task TamperSingleByte_InSignature_ReturnsExitCode2_SignatureFailure()
    {
        const string tenantId = "tenant-challenger-sig";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);

        var tamperedPath = Path.Combine(_fixture.BundlesDirectory, "tampered_sig_byte.clinicez-comms-bundle");
        CreateTamperedZip(bundlePath, tamperedPath, (name, bytes, writeMutated) =>
        {
            if (name == "bundle-signature.sig")
            {
                // Mutate 1 character in base64 signature
                bytes[0] = bytes[0] == (byte)'A' ? (byte)'B' : (byte)'A';
                writeMutated(bytes);
            }
        });

        // Test CLI Verify - Exit code 2 (SignatureFailure)
        var verifyExit = await Program.Main(new[]
        {
            "verify",
            "--bundle", tamperedPath,
            "--bundle-passphrase", _fixture.MigrationPassphrase
        });
        Assert.Equal(MigrationExitCodes.SignatureFailure, verifyExit);

        // Test ImportService direct verification - Signature failure
        var targetDb = _fixture.CreateDbContext("target_tamper_sig_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();
        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        var ex = await Assert.ThrowsAsync<CryptographicException>(() =>
            importService.ImportAsync(tamperedPath, _fixture.MigrationPassphrase, _fixture.SignerPublicKeyPem));
        Assert.Contains("signature", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task TamperSingleByte_InManifestJson_ReturnsExitCode2_SignatureFailure()
    {
        const string tenantId = "tenant-challenger-manifest";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);

        var tamperedPath = Path.Combine(_fixture.BundlesDirectory, "tampered_manifest_byte.clinicez-comms-bundle");
        CreateTamperedZip(bundlePath, tamperedPath, (name, bytes, writeMutated) =>
        {
            if (name == "bundle-manifest.json")
            {
                // Invert single byte in JSON
                var text = Encoding.UTF8.GetString(bytes);
                var tampered = text.Replace("comms", "comme");
                writeMutated(Encoding.UTF8.GetBytes(tampered));
            }
        });

        // Test CLI Verify - Exit code 2 (SignatureFailure)
        var verifyExit = await Program.Main(new[]
        {
            "verify",
            "--bundle", tamperedPath,
            "--bundle-passphrase", _fixture.MigrationPassphrase
        });
        Assert.Equal(MigrationExitCodes.SignatureFailure, verifyExit);

        // Test ImportService direct verification - Signature failure
        var targetDb = _fixture.CreateDbContext("target_tamper_manifest_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();
        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        var ex = await Assert.ThrowsAsync<CryptographicException>(() =>
            importService.ImportAsync(tamperedPath, _fixture.MigrationPassphrase, _fixture.SignerPublicKeyPem));
        Assert.Contains("signature", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("data/messages.json", "Morning clinical huddle", "Corrupted clinical huddle")]
    [InlineData("data/conversations.json", "General Facility Chat", "Corrupted Facility Chat")]
    [InlineData("data/participants.json", "Dr. Santos", "Dr. Hacker")]
    [InlineData("data/attachments-metadata.json", "lab_report.pdf", "corrupted.pdf")]
    public async Task TamperSingleByte_InAnyDataJson_ReturnsExitCode3_ChecksumMismatch(
        string datasetFile, string targetString, string replacementString)
    {
        const string tenantId = "tenant-challenger-dataset";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);

        var tamperedPath = Path.Combine(_fixture.BundlesDirectory, $"tampered_{Path.GetFileNameWithoutExtension(datasetFile)}.clinicez-comms-bundle");
        CreateTamperedZip(bundlePath, tamperedPath, (name, bytes, writeMutated) =>
        {
            if (string.Equals(name.Replace('\\', '/'), datasetFile, StringComparison.OrdinalIgnoreCase))
            {
                var text = Encoding.UTF8.GetString(bytes);
                Assert.Contains(targetString, text);
                var tampered = text.Replace(targetString, replacementString);
                writeMutated(Encoding.UTF8.GetBytes(tampered));
            }
        });

        // Test CLI Verify - Exit code 3 (ChecksumMismatch)
        var verifyExit = await Program.Main(new[]
        {
            "verify",
            "--bundle", tamperedPath,
            "--bundle-passphrase", _fixture.MigrationPassphrase
        });
        Assert.Equal(MigrationExitCodes.ChecksumMismatch, verifyExit);

        // Test ImportService direct verification - Integrity check failure
        var targetDb = _fixture.CreateDbContext("target_tamper_ds_db_" + Guid.NewGuid().ToString("N"));
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();
        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        var ex = await Assert.ThrowsAsync<CryptographicException>(() =>
            importService.ImportAsync(tamperedPath, _fixture.MigrationPassphrase, _fixture.SignerPublicKeyPem));
        Assert.True(
            ex.Message.Contains("integrity", StringComparison.OrdinalIgnoreCase) ||
            ex.Message.Contains("checksum", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task TamperSingleByte_InAttachmentCiphertext_CausesAesGcmAuthTagVerificationFailure()
    {
        const string tenantId = "tenant-challenger-att-tag";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);

        string? attachmentEntryName = null;
        byte[]? tamperedAttachmentBytes = null;
        string? attachmentIv = null;
        string? attachmentTag = null;
        byte[]? sessionKey = null;

        var tamperedPath = Path.Combine(_fixture.BundlesDirectory, "tampered_attachment_byte.clinicez-comms-bundle");
        CreateTamperedZip(bundlePath, tamperedPath, (name, bytes, writeMutated) =>
        {
            if (name.StartsWith("attachments/", StringComparison.OrdinalIgnoreCase) && name.EndsWith(".enc"))
            {
                attachmentEntryName = name;
                // Flip single bit in ciphertext payload
                bytes[0] ^= 0x01;
                tamperedAttachmentBytes = bytes;
                writeMutated(bytes);
            }
        });

        Assert.NotNull(attachmentEntryName);
        Assert.NotNull(tamperedAttachmentBytes);

        // Extract manifest to retrieve attachment metadata and session key
        using (var zip = ZipFile.OpenRead(bundlePath))
        {
            var manifestEntry = zip.GetEntry("bundle-manifest.json")!;
            using var r = new StreamReader(manifestEntry.Open());
            var manifest = JsonSerializer.Deserialize<MigrationManifest>(r.ReadToEnd(),
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase })!;
            sessionKey = AttachmentReEncryptionService.UnwrapSessionKey(manifest.Crypto, _fixture.MigrationPassphrase);

            var attMetaEntry = zip.GetEntry("data/attachments-metadata.json")!;
            using var ar = new StreamReader(attMetaEntry.Open());
            var attList = JsonSerializer.Deserialize<List<MessageAttachmentRecord>>(ar.ReadToEnd(),
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase })!;
            var att = attList.First();
            attachmentIv = att.BundleIvBase64;
            attachmentTag = att.BundleTagBase64;
        }

        // 1. Direct AES-256-GCM Decryption Test on Tampered Ciphertext
        var cryptoService = new AttachmentCryptoService(_fixture.TargetCellSecret);
        await Assert.ThrowsAnyAsync<CryptographicException>(async () =>
        {
            await cryptoService.DecryptFromBundleAsync(
                tamperedAttachmentBytes,
                sessionKey,
                attachmentIv,
                attachmentTag);
        });

        // 2. Direct ReEncryption ImportAttachmentAsync Test on Tampered Ciphertext
        await Assert.ThrowsAnyAsync<CryptographicException>(async () =>
        {
            await AttachmentReEncryptionService.ImportAttachmentAsync(
                cryptoService,
                tamperedAttachmentBytes,
                attachmentIv,
                attachmentTag,
                expectedSha256Checksum: "dummy_checksum",
                tenantId: tenantId,
                facilityId: "fac-01",
                bundleSessionKey: sessionKey);
        });

        // 3. Verification Service detects attachment tampering
        var verifyService = new MigrationVerifyService(cryptoService);
        var report = await verifyService.VerifyAsync(tamperedPath, _fixture.MigrationPassphrase, _fixture.SignerPublicKeyPem);
        Assert.False(report.IsValid);
        Assert.NotNull(report.FailureReason);
        Assert.Contains("tag", report.FailureReason, StringComparison.OrdinalIgnoreCase);

        // 4. CLI Import Rejects with rollback
        var targetDb = _fixture.CreateDbContext("target_challenger_att_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetGate = new TenantMigrationGate();
        var importService = new MigrationImportService(targetDb, targetStorage, cryptoService, targetGate);

        await Assert.ThrowsAnyAsync<CryptographicException>(async () =>
        {
            await importService.ImportAsync(tamperedPath, _fixture.MigrationPassphrase, _fixture.SignerPublicKeyPem);
        });

        // Verify zero attachments committed to DB
        var targetAttCount = await targetDb.MessageAttachments.IgnoreQueryFilters().CountAsync();
        Assert.Equal(0, targetAttCount);
    }

    [Fact]
    public void CompositeMerkleTree_HashCalculation_ValidatesAcrossConversationsAndMessages()
    {
        // 1. Deterministic conversation hashes
        var conv1 = new ConversationRecord
        {
            Id = Guid.NewGuid(),
            TenantId = "t-merkle",
            FacilityId = "f-1",
            Scope = ConversationScope.Facility,
            Kind = ConversationKind.General,
            Title = "Staff Room",
            Status = RequestStatus.Submitted,
            CreatedAtUtc = DateTime.UtcNow
        };
        var conv2 = new ConversationRecord
        {
            Id = Guid.NewGuid(),
            TenantId = "t-merkle",
            FacilityId = "f-1",
            Scope = ConversationScope.PatientFacility,
            Kind = ConversationKind.PatientTriage,
            Title = "Triage Queue",
            Status = RequestStatus.WithTriage,
            CreatedAtUtc = DateTime.UtcNow
        };

        var hashConv1 = MigrationManifestService.HashConversation(conv1);
        var hashConv2 = MigrationManifestService.HashConversation(conv2);
        Assert.Matches("^[0-9a-f]{64}$", hashConv1);
        Assert.Matches("^[0-9a-f]{64}$", hashConv2);

        var merkleConv = MigrationManifestService.ComputeCompositeMerkleHash(new[] { hashConv1, hashConv2 });
        var merkleConvOrderSwapped = MigrationManifestService.ComputeCompositeMerkleHash(new[] { hashConv2, hashConv1 });
        Assert.Equal(merkleConv, merkleConvOrderSwapped); // Deterministic ordering invariant

        // 2. Deterministic message hashes & avalanche effect
        var msg1 = new MessageRecord
        {
            Id = Guid.NewGuid(),
            ConversationId = conv1.Id,
            TenantId = "t-merkle",
            FacilityId = "f-1",
            Seq = 1,
            SenderType = "Staff",
            SenderId = "staff-01",
            ContentText = "Message A",
            Visibility = MessageVisibility.Public,
            State = DeliveryState.Received,
            ClientSentAtUtc = DateTime.UtcNow,
            ServerReceivedAtUtc = DateTime.UtcNow
        };
        var msg2 = new MessageRecord
        {
            Id = Guid.NewGuid(),
            ConversationId = conv1.Id,
            TenantId = "t-merkle",
            FacilityId = "f-1",
            Seq = 2,
            SenderType = "Staff",
            SenderId = "staff-02",
            ContentText = "Message B",
            Visibility = MessageVisibility.Public,
            State = DeliveryState.Received,
            ClientSentAtUtc = DateTime.UtcNow,
            ServerReceivedAtUtc = DateTime.UtcNow
        };

        var hashMsg1 = MigrationManifestService.HashMessage(msg1);
        var hashMsg2 = MigrationManifestService.HashMessage(msg2);
        var merkleMsg = MigrationManifestService.ComputeCompositeMerkleHash(new[] { hashMsg1, hashMsg2 });

        Assert.Matches("^[0-9a-f]{64}$", merkleMsg);

        // Perturb single character in Message B
        msg2.ContentText = "Message C";
        var hashMsg2Mutated = MigrationManifestService.HashMessage(msg2);
        var merkleMsgMutated = MigrationManifestService.ComputeCompositeMerkleHash(new[] { hashMsg1, hashMsg2Mutated });

        Assert.NotEqual(hashMsg2, hashMsg2Mutated);
        Assert.NotEqual(merkleMsg, merkleMsgMutated);

        // Empty hash oracle
        var emptyHash = MigrationManifestService.ComputeCompositeMerkleHash(Array.Empty<string>());
        var expectedEmptySha256 = Convert.ToHexString(SHA256.HashData(Array.Empty<byte>())).ToLowerInvariant();
        Assert.Equal(expectedEmptySha256, emptyHash);
    }

    [Fact]
    public async Task Tamper_MissingSignatureOrManifest_ThrowsCryptographicException()
    {
        const string tenantId = "tenant-challenger-missing";
        var bundlePath = await CreateValidTestBundleAsync(tenantId);

        // Create bundle without bundle-signature.sig
        var missingSigPath = Path.Combine(_fixture.BundlesDirectory, "missing_sig.clinicez-comms-bundle");
        using (var sourceArchive = ZipFile.OpenRead(bundlePath))
        using (var destArchive = ZipFile.Open(missingSigPath, ZipArchiveMode.Create))
        {
            foreach (var entry in sourceArchive.Entries)
            {
                if (entry.FullName == "bundle-signature.sig") continue; // drop signature
                var newEntry = destArchive.CreateEntry(entry.FullName);
                using var inStream = entry.Open();
                using var outStream = newEntry.Open();
                inStream.CopyTo(outStream);
            }
        }

        var verifyExit = await Program.Main(new[]
        {
            "verify",
            "--bundle", missingSigPath,
            "--bundle-passphrase", _fixture.MigrationPassphrase,
            "--trusted-signer-key", Convert.ToBase64String(Encoding.UTF8.GetBytes(_fixture.SignerPublicKeyPem))
        });
        Assert.NotEqual(MigrationExitCodes.Success, verifyExit);
    }

    public void Dispose() => _fixture.Dispose();
}
