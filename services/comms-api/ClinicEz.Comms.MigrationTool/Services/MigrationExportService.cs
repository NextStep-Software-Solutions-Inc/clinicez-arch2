using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Comms.MigrationTool.Models;
using ClinicEz.Shared.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Comms.MigrationTool.Services;

public sealed record ExportResult(
    string BundlePath,
    MigrationManifest Manifest,
    bool IsDryRun,
    Dictionary<string, int> RecordCounts);

public class MigrationExportService
{
    private readonly CommsDbContext _db;
    private readonly ICommsStorageService _storage;
    private readonly IAttachmentCryptoService _crypto;
    private readonly ITenantMigrationGate _migrationGate;
    private readonly IOutboxDrainService _outboxDrain;
    private readonly ILogger<MigrationExportService>? _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public MigrationExportService(
        CommsDbContext db,
        ICommsStorageService storage,
        IAttachmentCryptoService crypto,
        ITenantMigrationGate migrationGate,
        IOutboxDrainService outboxDrain,
        ILogger<MigrationExportService>? logger = null)
    {
        _db = db;
        _storage = storage;
        _crypto = crypto;
        _migrationGate = migrationGate;
        _outboxDrain = outboxDrain;
        _logger = logger;
    }

    public async Task<ExportResult> ExportAsync(
        string tenantId,
        string outputPath,
        string bundlePassphrase,
        string signerPrivateKeyPemOrBase64,
        string sourceCellId = "cloud",
        string sourceCellType = "Cloud",
        string targetCellId = "onprem",
        string targetCellType = "OnPrem",
        bool dryRun = false,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(tenantId);
        ArgumentNullException.ThrowIfNull(bundlePassphrase);
        ArgumentNullException.ThrowIfNull(signerPrivateKeyPemOrBase64);

        _logger?.LogInformation("Starting export for tenant {TenantId} (DryRun={DryRun})", tenantId, dryRun);

        // 1. Acquire write lock on source cell
        _migrationGate.SetState(new TenantMigrationState
        {
            TenantId = tenantId,
            State = MigrationLifecycleState.Exporting,
            LockedAtUtc = DateTime.UtcNow,
            SourceCellId = sourceCellId,
            TargetCellId = targetCellId,
            TargetCellType = targetCellType,
            Reason = "Migration export underway"
        });

        try
        {
            // 2. Quiesce & drain outbox
            var drainResult = await _outboxDrain.DrainAsync(tenantId, TimeSpan.FromSeconds(30), ct);
            _logger?.LogInformation("Outbox drain complete: {Message}", drainResult.Message);

            // 3. Query all tenant entities bypassing global filters
            var conversations = await _db.Conversations
                .IgnoreQueryFilters()
                .Where(c => c.TenantId == tenantId)
                .OrderBy(c => c.CreatedAtUtc)
                .Select(c => new ConversationRecord
                {
                    Id = c.Id,
                    TenantId = c.TenantId,
                    FacilityId = c.FacilityId,
                    BranchId = c.BranchId,
                    Scope = c.Scope,
                    Kind = c.Kind,
                    PatientId = c.PatientId,
                    SubmittingAccountId = c.SubmittingAccountId,
                    Relationship = c.Relationship,
                    GrantId = c.GrantId,
                    GrantWindowEndUtc = c.GrantWindowEndUtc,
                    ContextType = c.ContextType,
                    ContextId = c.ContextId,
                    Title = c.Title,
                    Category = c.Category,
                    Status = c.Status,
                    TriageDisposition = c.TriageDisposition,
                    DeclineReasonCode = c.DeclineReasonCode,
                    AssignedStaffId = c.AssignedStaffId,
                    AssignedStaffName = c.AssignedStaffName,
                    Priority = c.Priority,
                    IsEmergencyConfirmed = c.IsEmergencyConfirmed,
                    IsLocalOnly = c.IsLocalOnly,
                    ReopenCount = c.ReopenCount,
                    IsOffHoursSubmission = c.IsOffHoursSubmission,
                    TriageDueAtUtc = c.TriageDueAtUtc,
                    TriagedAtUtc = c.TriagedAtUtc,
                    TriagedByStaffId = c.TriagedByStaffId,
                    TriagedByStaffName = c.TriagedByStaffName,
                    IdleDeadlineUtc = c.IdleDeadlineUtc,
                    SlaBreached = c.SlaBreached,
                    SupervisorAlertedAtUtc = c.SupervisorAlertedAtUtc,
                    HomeCellId = c.HomeCellId,
                    LastMessageAtUtc = c.LastMessageAtUtc,
                    LastMessageSnippet = c.LastMessageSnippet,
                    MessageCount = c.MessageCount,
                    LastSeq = c.LastSeq,
                    CreatedAtUtc = c.CreatedAtUtc,
                    CreatedBy = c.CreatedBy,
                    ClosedAtUtc = c.ClosedAtUtc,
                    ClosedBy = c.ClosedBy,
                    Version = c.Version
                })
                .ToListAsync(ct);

            var participants = await _db.Participants
                .IgnoreQueryFilters()
                .Where(p => p.TenantId == tenantId)
                .OrderBy(p => p.JoinedAtUtc)
                .Select(p => new ParticipantRecord
                {
                    Id = p.Id,
                    ConversationId = p.ConversationId,
                    TenantId = p.TenantId,
                    ParticipantType = p.ParticipantType,
                    ParticipantId = p.ParticipantId,
                    DisplayName = p.DisplayName,
                    Role = p.Role,
                    JoinedAtUtc = p.JoinedAtUtc,
                    LeftAtUtc = p.LeftAtUtc,
                    LastReadMessageId = p.LastReadMessageId,
                    LastReadAtUtc = p.LastReadAtUtc,
                    IsMuted = p.IsMuted,
                    Version = p.Version
                })
                .ToListAsync(ct);

            var messages = await _db.Messages
                .IgnoreQueryFilters()
                .Where(m => m.TenantId == tenantId)
                .OrderBy(m => m.ConversationId)
                .ThenBy(m => m.Seq)
                .Select(m => new MessageRecord
                {
                    Id = m.Id,
                    ConversationId = m.ConversationId,
                    TenantId = m.TenantId,
                    FacilityId = m.FacilityId,
                    Seq = m.Seq,
                    SenderType = m.SenderType,
                    SenderId = m.SenderId,
                    SenderDisplayName = m.SenderDisplayName,
                    ContentText = m.ContentText,
                    Visibility = m.Visibility,
                    State = m.State,
                    RequiresAcknowledgement = m.RequiresAcknowledgement,
                    IsAcknowledged = m.IsAcknowledged,
                    AcknowledgedAtUtc = m.AcknowledgedAtUtc,
                    AcknowledgedByAccountId = m.AcknowledgedByAccountId,
                    AcknowledgedByName = m.AcknowledgedByName,
                    ClientSentAtUtc = m.ClientSentAtUtc,
                    ServerReceivedAtUtc = m.ServerReceivedAtUtc,
                    RetentionDeadlineUtc = m.RetentionDeadlineUtc,
                    ClientMessageId = m.ClientMessageId,
                    IsArchivedToChart = m.IsArchivedToChart,
                    ChartFilingDateUtc = m.ChartFilingDateUtc,
                    ChartFiledByStaffId = m.ChartFiledByStaffId,
                    UpdatedAtUtc = m.UpdatedAtUtc,
                    Version = m.Version
                })
                .ToListAsync(ct);

            var msgIds = messages.Select(m => m.Id).ToHashSet();
            var reactions = await _db.MessageReactions
                .IgnoreQueryFilters()
                .Where(r => msgIds.Contains(r.MessageId))
                .OrderBy(r => r.CreatedAtUtc)
                .Select(r => new MessageReactionRecord
                {
                    MessageId = r.MessageId,
                    UserId = r.UserId,
                    UserDisplayName = r.UserDisplayName,
                    Reaction = r.Reaction,
                    CreatedAtUtc = r.CreatedAtUtc
                })
                .ToListAsync(ct);

            var grants = await _db.EligibilityGrants
                .IgnoreQueryFilters()
                .Where(g => g.TenantId == tenantId)
                .OrderBy(g => g.CreatedAtUtc)
                .Select(g => new EligibilityGrantRecord
                {
                    Id = g.Id,
                    TenantId = g.TenantId,
                    FacilityId = g.FacilityId,
                    FacilityType = g.FacilityType,
                    PatientId = g.PatientId,
                    ContextType = g.ContextType,
                    ContextId = g.ContextId,
                    WindowStartUtc = g.WindowStartUtc,
                    WindowEndUtc = g.WindowEndUtc,
                    IsActive = g.IsActive,
                    RevokedAtUtc = g.RevokedAtUtc,
                    RevokeReason = g.RevokeReason,
                    Version = g.Version,
                    CreatedAtUtc = g.CreatedAtUtc
                })
                .ToListAsync(ct);

            var guestInvites = await _db.GuestInvites
                .IgnoreQueryFilters()
                .Where(gi => gi.TenantId == tenantId)
                .OrderBy(gi => gi.CreatedAtUtc)
                .Select(gi => new GuestInviteRecord
                {
                    Id = gi.Id,
                    TenantId = gi.TenantId,
                    FacilityId = gi.FacilityId,
                    CallId = gi.CallId,
                    AppointmentId = gi.AppointmentId,
                    InviteTokenHash = gi.InviteTokenHash,
                    ExpectedDobHash = gi.ExpectedDobHash,
                    OtpHash = gi.OtpHash,
                    AttemptCount = gi.AttemptCount,
                    IsLockedOut = gi.IsLockedOut,
                    Status = gi.Status,
                    ExpiresAtUtc = gi.ExpiresAtUtc,
                    VerifiedAtUtc = gi.VerifiedAtUtc,
                    ConsumedAtUtc = gi.ConsumedAtUtc,
                    CreatedAtUtc = gi.CreatedAtUtc,
                    CreatedByStaffId = gi.CreatedByStaffId,
                    MaskedRecipientPhone = gi.MaskedRecipientPhone
                })
                .ToListAsync(ct);

            var rawAttachments = await _db.MessageAttachments
                .IgnoreQueryFilters()
                .Where(a => a.TenantId == tenantId)
                .OrderBy(a => a.CreatedAtUtc)
                .ToListAsync(ct);

            var outboxMessages = await _db.InteropOutbox
                .Where(o => o.EnvelopeJson.Contains(tenantId) && o.DispatchedAtUtc != null)
                .OrderBy(o => o.CreatedAtUtc)
                .Select(o => new InteropOutboxRecord
                {
                    MessageId = o.MessageId,
                    CorrelationId = o.CorrelationId,
                    Type = o.Type,
                    EnvelopeJson = o.EnvelopeJson,
                    CreatedAtUtc = o.CreatedAtUtc,
                    AttemptCount = o.AttemptCount,
                    NextAttemptAtUtc = o.NextAttemptAtUtc,
                    DispatchedAtUtc = o.DispatchedAtUtc,
                    DeadLetteredAtUtc = o.DeadLetteredAtUtc,
                    LastError = o.LastError
                })
                .ToListAsync(ct);

            // 4. Setup signer key & bundle session key
            var keyString = signerPrivateKeyPemOrBase64.Trim();
            if (!keyString.Contains('\n') && !keyString.Contains("-----BEGIN") && File.Exists(keyString))
            {
                keyString = await File.ReadAllTextAsync(keyString, ct);
            }
            var normalizedSignerKey = PemKey.Normalize(keyString, "SignerPrivateKey");
            using var ecdsa = PemKey.ImportEcdsa(normalizedSignerKey!, "SignerPrivateKey");
            var signerPublicKeyPem = ecdsa.ExportSubjectPublicKeyInfoPem();

            var (bundleSessionKey, cryptoInfo) = AttachmentReEncryptionService.CreateAndWrapSessionKey(
                bundlePassphrase,
                "clinicez-comms-signer",
                signerPublicKeyPem);

            // 5. Re-encrypt attachments for bundle
            var attachmentPayloads = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
            var attachmentRecords = new List<MessageAttachmentRecord>();
            long totalCiphertextBytes = 0;
            var attachmentHashes = new List<string>();

            foreach (var rawAtt in rawAttachments)
            {
                var attRec = new MessageAttachmentRecord
                {
                    Id = rawAtt.Id,
                    TenantId = rawAtt.TenantId,
                    FacilityId = rawAtt.FacilityId,
                    MessageId = rawAtt.MessageId,
                    OriginalFileName = rawAtt.OriginalFileName,
                    SafeFileName = rawAtt.SafeFileName,
                    ContentType = rawAtt.ContentType,
                    OriginalSizeBytes = rawAtt.OriginalSizeBytes,
                    SanitizedSizeBytes = rawAtt.SanitizedSizeBytes,
                    StoragePath = rawAtt.StoragePath,
                    SHA256Checksum = rawAtt.SHA256Checksum,
                    Status = rawAtt.Status,
                    QuarantineReason = rawAtt.QuarantineReason,
                    StrippedExif = rawAtt.StrippedExif,
                    ConvertedFromOriginal = rawAtt.ConvertedFromOriginal,
                    EncryptionAlgorithm = rawAtt.EncryptionAlgorithm,
                    EncryptionKeyId = rawAtt.EncryptionKeyId,
                    EncryptionIvBase64 = rawAtt.EncryptionIvBase64,
                    EncryptionTagBase64 = rawAtt.EncryptionTagBase64,
                    WrappedKeyJson = rawAtt.WrappedKeyJson,
                    IsFiledToChart = rawAtt.IsFiledToChart,
                    FiledAtUtc = rawAtt.FiledAtUtc,
                    FiledByStaffId = rawAtt.FiledByStaffId,
                    CreatedAtUtc = rawAtt.CreatedAtUtc,
                    ScannedAtUtc = rawAtt.ScannedAtUtc
                };

                if (!string.IsNullOrWhiteSpace(rawAtt.StoragePath))
                {
                    var sourceCiphertext = await _storage.ReadEncryptedAttachmentAsync(rawAtt.StoragePath, ct);
                    if (sourceCiphertext != null && sourceCiphertext.Length > 0)
                    {
                        var metadata = new AttachmentCryptoMetadata(
                            rawAtt.EncryptionAlgorithm,
                            rawAtt.EncryptionKeyId,
                            rawAtt.EncryptionIvBase64,
                            rawAtt.EncryptionTagBase64,
                            rawAtt.WrappedKeyJson);

                        var (bundleCiphertext, ivB64, tagB64) = await AttachmentReEncryptionService.ExportAttachmentAsync(
                            _crypto,
                            sourceCiphertext,
                            metadata,
                            rawAtt.SHA256Checksum,
                            rawAtt.TenantId,
                            rawAtt.FacilityId,
                            bundleSessionKey,
                            ct);

                        var entryName = $"attachments/{rawAtt.Id:N}.enc";
                        attRec.BundleCiphertextFileName = entryName;
                        attRec.BundleIvBase64 = ivB64;
                        attRec.BundleTagBase64 = tagB64;
                        attRec.BundleCiphertextSizeBytes = bundleCiphertext.Length;

                        totalCiphertextBytes += bundleCiphertext.Length;
                        attachmentPayloads[entryName] = bundleCiphertext;
                        attachmentHashes.Add(Convert.ToHexString(SHA256.HashData(bundleCiphertext)).ToLowerInvariant());
                    }
                }

                attachmentRecords.Add(attRec);
            }

            // 6. Serialize datasets and compute SHA-256 + Merkle hashes
            var datasetFiles = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
            var manifestDatasets = new Dictionary<string, DatasetSummary>(StringComparer.OrdinalIgnoreCase);

            void AddDataset<T>(string key, string relativeFileName, List<T> list, Func<T, string> hashFunc)
            {
                var jsonBytes = JsonSerializer.SerializeToUtf8Bytes(list, JsonOpts);
                datasetFiles[relativeFileName] = jsonBytes;

                var fileSha256 = Convert.ToHexString(SHA256.HashData(jsonBytes)).ToLowerInvariant();
                var merkleHash = MigrationManifestService.ComputeCompositeMerkleHash(list.Select(hashFunc));

                manifestDatasets[key] = new DatasetSummary
                {
                    FileName = relativeFileName,
                    RecordCount = list.Count,
                    Sha256 = fileSha256,
                    SizeBytes = jsonBytes.Length,
                    CompositeMerkleHash = merkleHash
                };
            }

            AddDataset("conversations", "data/conversations.json", conversations, MigrationManifestService.HashConversation);
            AddDataset("participants", "data/participants.json", participants, MigrationManifestService.HashParticipant);
            AddDataset("messages", "data/messages.json", messages, MigrationManifestService.HashMessage);
            AddDataset("messageReactions", "data/message-reactions.json", reactions, MigrationManifestService.HashReaction);
            AddDataset("eligibilityGrants", "data/eligibility-grants.json", grants, MigrationManifestService.HashGrant);
            AddDataset("guestInvites", "data/guest-invites.json", guestInvites, MigrationManifestService.HashGuestInvite);
            AddDataset("attachmentsMetadata", "data/attachments-metadata.json", attachmentRecords, MigrationManifestService.HashAttachment);
            if (outboxMessages.Count > 0)
            {
                AddDataset("interopOutbox", "data/interop-outbox.json", outboxMessages, MigrationManifestService.HashOutbox);
            }

            // 7. Assemble Manifest
            var manifest = new MigrationManifest
            {
                ManifestVersion = "1.0",
                BundleId = Guid.NewGuid(),
                TenantId = tenantId,
                ExportedAtUtc = DateTime.UtcNow,
                SourceCell = new CellInfo
                {
                    CellId = sourceCellId,
                    CellType = sourceCellType,
                    ServiceVersion = "1.0.0",
                    DbSchema = "comms"
                },
                TargetCell = new TargetCellInfo
                {
                    CellId = targetCellId,
                    CellType = targetCellType,
                    ExpectedTenantId = tenantId
                },
                SchemaVersion = "20261026144020",
                Crypto = cryptoInfo,
                Datasets = manifestDatasets,
                AttachmentsSummary = new AttachmentsSummary
                {
                    TotalCount = attachmentPayloads.Count,
                    TotalCiphertextBytes = totalCiphertextBytes,
                    AttachmentCheckTreeSha256 = MigrationManifestService.ComputeCompositeMerkleHash(attachmentHashes)
                }
            };

            // Sign manifest
            var signatureBase64 = MigrationManifestService.SignManifest(manifest, ecdsa);

            var counts = new Dictionary<string, int>
            {
                ["conversations"] = conversations.Count,
                ["participants"] = participants.Count,
                ["messages"] = messages.Count,
                ["messageReactions"] = reactions.Count,
                ["eligibilityGrants"] = grants.Count,
                ["guestInvites"] = guestInvites.Count,
                ["attachmentsMetadata"] = attachmentRecords.Count,
                ["attachmentsPayloads"] = attachmentPayloads.Count,
                ["interopOutbox"] = outboxMessages.Count
            };

            // 8. Package bundle (unless dryRun)
            if (!dryRun)
            {
                await MigrationBundleService.PackageBundleAsync(
                    manifest,
                    datasetFiles,
                    attachmentPayloads,
                    signatureBase64,
                    outputPath,
                    ct);
            }

            // 9. Unlock source tenant
            _migrationGate.SetState(new TenantMigrationState
            {
                TenantId = tenantId,
                State = MigrationLifecycleState.Idle,
                CompletedAtUtc = DateTime.UtcNow
            });

            _logger?.LogInformation("Export successfully completed for tenant {TenantId}. Bundle: {Path}", tenantId, outputPath);

            return new ExportResult(outputPath, manifest, dryRun, counts);
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Export failed for tenant {TenantId}. Aborting and unlocking tenant.", tenantId);
            _migrationGate.SetState(new TenantMigrationState
            {
                TenantId = tenantId,
                State = MigrationLifecycleState.Aborted,
                AbortedAtUtc = DateTime.UtcNow,
                AbortReason = ex.Message
            });
            throw;
        }
    }
}
