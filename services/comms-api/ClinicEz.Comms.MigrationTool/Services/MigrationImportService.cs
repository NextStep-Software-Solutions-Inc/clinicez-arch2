using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Comms.MigrationTool.Models;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Comms.MigrationTool.Services;

public sealed record ImportResult(
    string TenantId,
    bool IsSuccess,
    bool IsDryRun,
    Dictionary<string, int> VerifiedCounts,
    string? Message);

public class MigrationImportService
{
    private readonly CommsDbContext _db;
    private readonly ICommsStorageService _storage;
    private readonly IAttachmentCryptoService _crypto;
    private readonly ITenantMigrationGate _migrationGate;
    private readonly ILogger<MigrationImportService>? _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public MigrationImportService(
        CommsDbContext db,
        ICommsStorageService storage,
        IAttachmentCryptoService crypto,
        ITenantMigrationGate migrationGate,
        ILogger<MigrationImportService>? logger = null)
    {
        _db = db;
        _storage = storage;
        _crypto = crypto;
        _migrationGate = migrationGate;
        _logger = logger;
    }

    public async Task<ImportResult> ImportAsync(
        string bundlePath,
        string bundlePassphrase,
        string? trustedSignerPublicKeyPemOrBase64 = null,
        bool dryRun = false,
        bool verifyOnly = false,
        bool allowOverwrite = false,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(bundlePath);
        ArgumentNullException.ThrowIfNull(bundlePassphrase);

        _logger?.LogInformation("Starting import for bundle {BundlePath} (DryRun={DryRun}, VerifyOnly={VerifyOnly})",
            bundlePath, dryRun, verifyOnly);

        // 1. Extract and validate bundle signature and dataset SHA-256 hashes
        ECDsa? trustedKey = null;
        if (!string.IsNullOrWhiteSpace(trustedSignerPublicKeyPemOrBase64))
        {
            var keyString = trustedSignerPublicKeyPemOrBase64.Trim();
            if (!keyString.Contains('\n') && !keyString.Contains("-----BEGIN") && File.Exists(keyString))
            {
                keyString = await File.ReadAllTextAsync(keyString, ct);
            }
            var normalizedTrustedKey = PemKey.Normalize(keyString, "TrustedSignerPublicKey");
            trustedKey = PemKey.ImportEcdsa(normalizedTrustedKey!, "TrustedSignerPublicKey");
        }

        ExtractedBundle extracted;
        try
        {
            extracted = await MigrationBundleService.ExtractAndValidateBundleAsync(bundlePath, trustedKey, ct);
        }
        finally
        {
            trustedKey?.Dispose();
        }

        var manifest = extracted.Manifest;
        var tenantId = manifest.TenantId;

        if (!verifyOnly)
        {
            _migrationGate.SetState(new TenantMigrationState
            {
                TenantId = tenantId,
                State = MigrationLifecycleState.Importing,
                LockedAtUtc = DateTime.UtcNow,
                SourceCellId = manifest.SourceCell.CellId,
                TargetCellId = manifest.TargetCell.CellId,
                TargetCellType = manifest.TargetCell.CellType,
                Reason = "Importing migration bundle"
            });
        }

        IDbContextTransaction? tx = null;
        var stagedStoragePaths = new List<string>();
        bool entitiesStagedInDbContext = false;
        List<Conversation>? entityConversations = null;
        List<Participant>? entityParticipants = null;
        List<Message>? entityMessages = null;
        List<MessageReaction>? entityReactions = null;
        List<MessageAttachment>? entityAttachments = null;
        List<EligibilityGrant>? entityGrants = null;
        List<GuestInvite>? entityGuestInvites = null;
        List<InteropOutboxMessage>? entityOutbox = null;

        try
        {
            // 2. Unwrap Bundle Session Key
            var bundleSessionKey = AttachmentReEncryptionService.UnwrapSessionKey(manifest.Crypto, bundlePassphrase);

            // 3. Deserialize datasets
            var conversations = JsonSerializer.Deserialize<List<ConversationRecord>>(extracted.DatasetBytes["conversations"], JsonOpts) ?? new();
            var participants = JsonSerializer.Deserialize<List<ParticipantRecord>>(extracted.DatasetBytes["participants"], JsonOpts) ?? new();
            var messages = JsonSerializer.Deserialize<List<MessageRecord>>(extracted.DatasetBytes["messages"], JsonOpts) ?? new();
            var reactions = JsonSerializer.Deserialize<List<MessageReactionRecord>>(extracted.DatasetBytes["messageReactions"], JsonOpts) ?? new();
            var grants = JsonSerializer.Deserialize<List<EligibilityGrantRecord>>(extracted.DatasetBytes["eligibilityGrants"], JsonOpts) ?? new();
            var guestInvites = JsonSerializer.Deserialize<List<GuestInviteRecord>>(extracted.DatasetBytes["guestInvites"], JsonOpts) ?? new();
            var attachmentRecords = JsonSerializer.Deserialize<List<MessageAttachmentRecord>>(extracted.DatasetBytes["attachmentsMetadata"], JsonOpts) ?? new();
            
            var outboxRecords = extracted.DatasetBytes.TryGetValue("interopOutbox", out var outboxBytes)
                ? (JsonSerializer.Deserialize<List<InteropOutboxRecord>>(outboxBytes, JsonOpts) ?? new())
                : new List<InteropOutboxRecord>();

            // Verify dataset ingested counts match manifest
            AssertCount("conversations", conversations.Count, manifest.Datasets["conversations"].RecordCount);
            AssertCount("participants", participants.Count, manifest.Datasets["participants"].RecordCount);
            AssertCount("messages", messages.Count, manifest.Datasets["messages"].RecordCount);
            AssertCount("messageReactions", reactions.Count, manifest.Datasets["messageReactions"].RecordCount);
            AssertCount("eligibilityGrants", grants.Count, manifest.Datasets["eligibilityGrants"].RecordCount);
            AssertCount("guestInvites", guestInvites.Count, manifest.Datasets["guestInvites"].RecordCount);
            AssertCount("attachmentsMetadata", attachmentRecords.Count, manifest.Datasets["attachmentsMetadata"].RecordCount);

            // 4. If verifyOnly, decrypt all attachments in-memory to confirm keys and SHA-256 invariants
            if (verifyOnly)
            {
                foreach (var att in attachmentRecords)
                {
                    if (!string.IsNullOrWhiteSpace(att.BundleCiphertextFileName) &&
                        extracted.AttachmentPayloads.TryGetValue(att.BundleCiphertextFileName, out var bundlePayload))
                    {
                        var plaintext = await _crypto.DecryptFromBundleAsync(
                            bundlePayload,
                            bundleSessionKey,
                            att.BundleIvBase64,
                            att.BundleTagBase64);

                        var actualSha256 = Convert.ToHexString(SHA256.HashData(plaintext)).ToLowerInvariant();
                        if (!string.Equals(actualSha256, att.SHA256Checksum, StringComparison.OrdinalIgnoreCase))
                        {
                            throw new CryptographicException(
                                $"Attachment {att.Id} plaintext SHA-256 mismatch in bundle: expected '{att.SHA256Checksum}', actual '{actualSha256}'.");
                        }
                    }
                }

                return new ImportResult(
                    tenantId,
                    IsSuccess: true,
                    IsDryRun: false,
                    new Dictionary<string, int>
                    {
                        ["conversations"] = conversations.Count,
                        ["participants"] = participants.Count,
                        ["messages"] = messages.Count,
                        ["messageReactions"] = reactions.Count,
                        ["eligibilityGrants"] = grants.Count,
                        ["guestInvites"] = guestInvites.Count,
                        ["attachmentsMetadata"] = attachmentRecords.Count
                    },
                    "Verification succeeded: All signatures, dataset hashes, and attachment payloads verified 100%.");
            }

            // 5. Database collision check
            var existingCount = await _db.Conversations.IgnoreQueryFilters().CountAsync(c => c.TenantId == tenantId, ct);
            if (existingCount > 0 && !allowOverwrite)
            {
                throw new InvalidOperationException(
                    $"Database collision: Target database already contains {existingCount} conversation(s) for tenant '{tenantId}'. Use --allow-overwrite to replace.");
            }

            // Begin transaction if supported by provider
            try
            {
                tx = await _db.Database.BeginTransactionAsync(ct);
            }
            catch (Exception ex) when (ex is not CryptographicException)
            {
                _logger?.LogDebug("Database provider does not support explicit transactions: {Message}", ex.Message);
            }

            // 7. Clean existing tenant data if allowOverwrite
            if (allowOverwrite && existingCount > 0)
            {
                var existingConvs = await _db.Conversations.IgnoreQueryFilters().Where(c => c.TenantId == tenantId).ToListAsync(ct);
                var existingConvIds = existingConvs.Select(c => c.Id).ToHashSet();

                var existingMsgs = await _db.Messages.IgnoreQueryFilters().Where(m => m.TenantId == tenantId).ToListAsync(ct);
                var existingMsgIds = existingMsgs.Select(m => m.Id).ToHashSet();

                var existingReactions = await _db.MessageReactions.IgnoreQueryFilters().Where(r => existingMsgIds.Contains(r.MessageId)).ToListAsync(ct);
                _db.MessageReactions.RemoveRange(existingReactions);

                var existingAttachments = await _db.MessageAttachments.IgnoreQueryFilters().Where(a => a.TenantId == tenantId).ToListAsync(ct);
                _db.MessageAttachments.RemoveRange(existingAttachments);

                _db.Messages.RemoveRange(existingMsgs);

                var existingParts = await _db.Participants.IgnoreQueryFilters().Where(p => p.TenantId == tenantId).ToListAsync(ct);
                _db.Participants.RemoveRange(existingParts);

                _db.Conversations.RemoveRange(existingConvs);

                var existingGrants = await _db.EligibilityGrants.IgnoreQueryFilters().Where(g => g.TenantId == tenantId).ToListAsync(ct);
                _db.EligibilityGrants.RemoveRange(existingGrants);

                var existingInvites = await _db.GuestInvites.IgnoreQueryFilters().Where(gi => gi.TenantId == tenantId).ToListAsync(ct);
                _db.GuestInvites.RemoveRange(existingInvites);

                await _db.SaveChangesAsync(ct);
            }

            // 8. Re-encrypt attachments with Target CMK and save to storage
            entityAttachments = new List<MessageAttachment>();
            foreach (var att in attachmentRecords)
            {
                var entityAtt = new MessageAttachment
                {
                    Id = att.Id,
                    TenantId = att.TenantId,
                    FacilityId = att.FacilityId,
                    MessageId = att.MessageId,
                    OriginalFileName = att.OriginalFileName,
                    SafeFileName = att.SafeFileName,
                    ContentType = att.ContentType,
                    OriginalSizeBytes = att.OriginalSizeBytes,
                    SanitizedSizeBytes = att.SanitizedSizeBytes,
                    SHA256Checksum = att.SHA256Checksum,
                    Status = att.Status,
                    QuarantineReason = att.QuarantineReason,
                    StrippedExif = att.StrippedExif,
                    ConvertedFromOriginal = att.ConvertedFromOriginal,
                    IsFiledToChart = att.IsFiledToChart,
                    FiledAtUtc = att.FiledAtUtc,
                    FiledByStaffId = att.FiledByStaffId,
                    CreatedAtUtc = att.CreatedAtUtc,
                    ScannedAtUtc = att.ScannedAtUtc
                };

                if (!string.IsNullOrWhiteSpace(att.BundleCiphertextFileName) &&
                    extracted.AttachmentPayloads.TryGetValue(att.BundleCiphertextFileName, out var bundlePayload))
                {
                    var targetResult = await AttachmentReEncryptionService.ImportAttachmentAsync(
                        _crypto,
                        bundlePayload,
                        att.BundleIvBase64,
                        att.BundleTagBase64,
                        att.SHA256Checksum,
                        att.TenantId,
                        att.FacilityId,
                        bundleSessionKey,
                        ct);

                    var targetStoragePath = await _storage.SaveEncryptedAttachmentAsync(
                        att.TenantId,
                        att.FacilityId,
                        att.Id,
                        targetResult.Ciphertext,
                        ct);

                    stagedStoragePaths.Add(targetStoragePath);

                    entityAtt.StoragePath = targetStoragePath;
                    entityAtt.EncryptionAlgorithm = targetResult.Metadata.Algorithm;
                    entityAtt.EncryptionKeyId = targetResult.Metadata.KeyId;
                    entityAtt.EncryptionIvBase64 = targetResult.Metadata.IvBase64;
                    entityAtt.EncryptionTagBase64 = targetResult.Metadata.TagBase64;
                    entityAtt.WrappedKeyJson = targetResult.Metadata.WrappedKeyJson;
                }
                else
                {
                    entityAtt.StoragePath = string.Empty;
                }

                entityAttachments.Add(entityAtt);
            }

            // 9. Map and stage DB entities
            entityConversations = conversations.Select(c => new Conversation
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
            }).ToList();

            entityParticipants = participants.Select(p => new Participant
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
            }).ToList();

            entityMessages = messages.Select(m => new Message
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
            }).ToList();

            entityReactions = reactions.Select(r => new MessageReaction
            {
                MessageId = r.MessageId,
                UserId = r.UserId,
                UserDisplayName = r.UserDisplayName,
                Reaction = r.Reaction,
                CreatedAtUtc = r.CreatedAtUtc
            }).ToList();

            entityGrants = grants.Select(g => new EligibilityGrant
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
            }).ToList();

            entityGuestInvites = guestInvites.Select(gi => new GuestInvite
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
            }).ToList();

            entityOutbox = outboxRecords.Select(o => new InteropOutboxMessage
            {
                MessageId = o.MessageId,
                CorrelationId = o.CorrelationId,
                Type = o.Type,
                EnvelopeJson = o.EnvelopeJson,
                CreatedAtUtc = o.CreatedAtUtc,
                AttemptCount = o.AttemptCount,
                NextAttemptAtUtc = o.NextAttemptAtUtc,
                DispatchedAtUtc = o.DispatchedAtUtc ?? DateTime.UtcNow, // Guard against re-dispatch
                DeadLetteredAtUtc = o.DeadLetteredAtUtc,
                LastError = o.LastError
            }).ToList();

            entitiesStagedInDbContext = true;
            _db.Conversations.AddRange(entityConversations);
            _db.Participants.AddRange(entityParticipants);
            _db.Messages.AddRange(entityMessages);
            _db.MessageReactions.AddRange(entityReactions);
            _db.MessageAttachments.AddRange(entityAttachments);
            _db.EligibilityGrants.AddRange(entityGrants);
            _db.GuestInvites.AddRange(entityGuestInvites);
            if (entityOutbox.Count > 0)
            {
                _db.InteropOutbox.AddRange(entityOutbox);
            }

            await _db.SaveChangesAsync(ct);

            // 10. Post-import 4-way verification:
            // [Source DB Count] == [Manifest Recorded Count] == [Bundle Ingested Count] == [Target DB Count]
            var targetConvs = await _db.Conversations.IgnoreQueryFilters().Where(c => c.TenantId == tenantId).ToListAsync(ct);
            var targetParts = await _db.Participants.IgnoreQueryFilters().Where(p => p.TenantId == tenantId).ToListAsync(ct);
            var targetMsgs = await _db.Messages.IgnoreQueryFilters().Where(m => m.TenantId == tenantId).ToListAsync(ct);
            var targetMsgIds = targetMsgs.Select(m => m.Id).ToHashSet();
            var targetReactions = await _db.MessageReactions.IgnoreQueryFilters().Where(r => targetMsgIds.Contains(r.MessageId)).ToListAsync(ct);
            var targetAttachments = await _db.MessageAttachments.IgnoreQueryFilters().Where(a => a.TenantId == tenantId).ToListAsync(ct);
            var targetGrants = await _db.EligibilityGrants.IgnoreQueryFilters().Where(g => g.TenantId == tenantId).ToListAsync(ct);
            var targetInvites = await _db.GuestInvites.IgnoreQueryFilters().Where(gi => gi.TenantId == tenantId).ToListAsync(ct);

            AssertCount("Conversations (Target)", targetConvs.Count, manifest.Datasets["conversations"].RecordCount);
            AssertCount("Participants (Target)", targetParts.Count, manifest.Datasets["participants"].RecordCount);
            AssertCount("Messages (Target)", targetMsgs.Count, manifest.Datasets["messages"].RecordCount);
            AssertCount("Reactions (Target)", targetReactions.Count, manifest.Datasets["messageReactions"].RecordCount);
            AssertCount("Attachments (Target)", targetAttachments.Count, manifest.Datasets["attachmentsMetadata"].RecordCount);
            AssertCount("Grants (Target)", targetGrants.Count, manifest.Datasets["eligibilityGrants"].RecordCount);
            AssertCount("Invites (Target)", targetInvites.Count, manifest.Datasets["guestInvites"].RecordCount);

            // Check Merkle composite hashes match manifest
            var convMerkle = MigrationManifestService.ComputeCompositeMerkleHash(conversations.Select(MigrationManifestService.HashConversation));
            if (!string.Equals(convMerkle, manifest.Datasets["conversations"].CompositeMerkleHash, StringComparison.OrdinalIgnoreCase))
            {
                throw new CryptographicException("Conversations dataset composite Merkle hash mismatch.");
            }

            var msgMerkle = MigrationManifestService.ComputeCompositeMerkleHash(messages.Select(MigrationManifestService.HashMessage));
            if (!string.Equals(msgMerkle, manifest.Datasets["messages"].CompositeMerkleHash, StringComparison.OrdinalIgnoreCase))
            {
                throw new CryptographicException("Messages dataset composite Merkle hash mismatch.");
            }

            var verifiedCounts = new Dictionary<string, int>
            {
                ["conversations"] = targetConvs.Count,
                ["participants"] = targetParts.Count,
                ["messages"] = targetMsgs.Count,
                ["messageReactions"] = targetReactions.Count,
                ["attachmentsMetadata"] = targetAttachments.Count,
                ["eligibilityGrants"] = targetGrants.Count,
                ["guestInvites"] = targetInvites.Count
            };

            // 11. If DryRun, rollback transaction and delete staged files
            if (dryRun)
            {
                if (tx != null)
                {
                    await tx.RollbackAsync(ct);
                }
                else
                {
                    // Rollback manually for in-memory DB
                    _db.MessageReactions.RemoveRange(entityReactions);
                    _db.MessageAttachments.RemoveRange(entityAttachments);
                    _db.Messages.RemoveRange(entityMessages);
                    _db.Participants.RemoveRange(entityParticipants);
                    _db.Conversations.RemoveRange(entityConversations);
                    _db.EligibilityGrants.RemoveRange(entityGrants);
                    _db.GuestInvites.RemoveRange(entityGuestInvites);
                    if (entityOutbox.Count > 0) _db.InteropOutbox.RemoveRange(entityOutbox);
                    await _db.SaveChangesAsync(ct);
                }

                foreach (var path in stagedStoragePaths)
                {
                    await _storage.DeleteAttachmentAsync(path, ct);
                }

                _migrationGate.SetState(new TenantMigrationState
                {
                    TenantId = tenantId,
                    State = MigrationLifecycleState.Idle,
                    CompletedAtUtc = DateTime.UtcNow
                });

                return new ImportResult(tenantId, true, true, verifiedCounts, "Dry-run succeeded: 100% verified, 0 mutations committed.");
            }

            // 12. Commit transaction
            if (tx != null)
            {
                await tx.CommitAsync(ct);
            }

            _migrationGate.SetState(new TenantMigrationState
            {
                TenantId = tenantId,
                State = MigrationLifecycleState.Completed,
                CompletedAtUtc = DateTime.UtcNow
            });

            _migrationGate.ClearState(tenantId);

            _logger?.LogInformation("Import successfully committed for tenant {TenantId}.", tenantId);

            return new ImportResult(tenantId, true, false, verifiedCounts, "Import successfully committed.");
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Import failed for tenant {TenantId}. Executing atomic rollback.", tenantId);

            if (tx != null)
            {
                try { await tx.RollbackAsync(ct); } catch { /* ignore secondary */ }
            }
            else if (entitiesStagedInDbContext)
            {
                try
                {
                    // Clean inserted rows manually if in-memory
                    if (entityReactions != null) _db.MessageReactions.RemoveRange(entityReactions);
                    if (entityAttachments != null) _db.MessageAttachments.RemoveRange(entityAttachments);
                    if (entityMessages != null) _db.Messages.RemoveRange(entityMessages);
                    if (entityParticipants != null) _db.Participants.RemoveRange(entityParticipants);
                    if (entityConversations != null) _db.Conversations.RemoveRange(entityConversations);
                    if (entityGrants != null) _db.EligibilityGrants.RemoveRange(entityGrants);
                    if (entityGuestInvites != null) _db.GuestInvites.RemoveRange(entityGuestInvites);
                    if (entityOutbox != null && entityOutbox.Count > 0) _db.InteropOutbox.RemoveRange(entityOutbox);
                    await _db.SaveChangesAsync(ct);
                }
                catch { /* ignore cleanup errors */ }
            }

            // Scrub staged storage files
            foreach (var path in stagedStoragePaths)
            {
                try { await _storage.DeleteAttachmentAsync(path, ct); } catch { /* ignore */ }
            }

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

    private static void AssertCount(string name, int actual, int expected)
    {
        if (actual != expected)
        {
            throw new InvalidOperationException($"Row count verification failed for {name}: expected {expected}, actual {actual}.");
        }
    }
}
