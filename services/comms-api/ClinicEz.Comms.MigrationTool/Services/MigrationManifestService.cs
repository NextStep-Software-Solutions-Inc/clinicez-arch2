using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using ClinicEz.Comms.MigrationTool.Models;
using ClinicEz.Shared.Interop;

namespace ClinicEz.Comms.MigrationTool.Services;

public class MigrationManifestService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public static byte[] GetCanonicalManifestBytes(MigrationManifest manifest)
    {
        ArgumentNullException.ThrowIfNull(manifest);

        var json = JsonSerializer.Serialize(manifest, JsonOpts);
        var jsonNode = JsonNode.Parse(json)?.AsObject()
            ?? throw new InvalidOperationException("Failed to parse manifest as JSON object.");

        // Remove signature property from canonical signing payload
        jsonNode.Remove("signature");

        var doc = JsonDocument.Parse(jsonNode.ToJsonString());
        return EnvelopeSigning.CanonicalPayload(doc.RootElement);
    }

    public static string SignManifest(MigrationManifest manifest, ECDsa privateKey)
    {
        ArgumentNullException.ThrowIfNull(manifest);
        ArgumentNullException.ThrowIfNull(privateKey);

        var canonicalBytes = GetCanonicalManifestBytes(manifest);
        var signatureBytes = privateKey.SignData(canonicalBytes, HashAlgorithmName.SHA256);
        var signatureBase64 = Convert.ToBase64String(signatureBytes);
        manifest.Signature = signatureBase64;
        return signatureBase64;
    }

    public static bool VerifyManifest(MigrationManifest manifest, ECDsa publicKey, string? explicitSignature = null)
    {
        ArgumentNullException.ThrowIfNull(manifest);
        ArgumentNullException.ThrowIfNull(publicKey);

        var sig = explicitSignature ?? manifest.Signature;
        if (string.IsNullOrWhiteSpace(sig)) return false;

        try
        {
            var canonicalBytes = GetCanonicalManifestBytes(manifest);
            var signatureBytes = Convert.FromBase64String(sig);
            return publicKey.VerifyData(canonicalBytes, signatureBytes, HashAlgorithmName.SHA256);
        }
        catch (FormatException)
        {
            return false;
        }
        catch (CryptographicException)
        {
            return false;
        }
    }

    public static string ComputeCompositeMerkleHash(IEnumerable<string> entityHashes)
    {
        var sorted = entityHashes
            .Where(h => !string.IsNullOrWhiteSpace(h))
            .OrderBy(h => h, StringComparer.Ordinal)
            .ToList();

        if (sorted.Count == 0)
        {
            return Convert.ToHexString(SHA256.HashData(Array.Empty<byte>())).ToLowerInvariant();
        }

        var combined = string.Join("|", sorted);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(combined))).ToLowerInvariant();
    }

    public static string HashConversation(ConversationRecord r)
    {
        var raw = $"{r.Id}|{r.TenantId}|{r.FacilityId}|{r.BranchId}|{r.Scope}|{r.Kind}|{r.PatientId}|{r.Title}|{r.Category}|{r.Status}|{r.TriageDisposition}|{r.DeclineReasonCode}|{r.CreatedAtUtc:O}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    }

    public static string HashParticipant(ParticipantRecord r)
    {
        var raw = $"{r.Id}|{r.ConversationId}|{r.TenantId}|{r.ParticipantType}|{r.ParticipantId}|{r.Role}|{r.JoinedAtUtc:O}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    }

    public static string HashMessage(MessageRecord r)
    {
        var raw = $"{r.Id}|{r.ConversationId}|{r.TenantId}|{r.FacilityId}|{r.Seq}|{r.SenderType}|{r.SenderId}|{r.ContentText}|{r.Visibility}|{r.State}|{r.ClientSentAtUtc:O}|{r.ServerReceivedAtUtc:O}|{r.RetentionDeadlineUtc:O}|{r.ClientMessageId}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    }

    public static string HashReaction(MessageReactionRecord r)
    {
        var raw = $"{r.MessageId}|{r.UserId}|{r.Reaction}|{r.CreatedAtUtc:O}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    }

    public static string HashGrant(EligibilityGrantRecord r)
    {
        var raw = $"{r.Id}|{r.TenantId}|{r.FacilityId}|{r.PatientId}|{r.ContextType}|{r.ContextId}|{r.WindowStartUtc:O}|{r.WindowEndUtc:O}|{r.IsActive}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    }

    public static string HashGuestInvite(GuestInviteRecord r)
    {
        var raw = $"{r.Id}|{r.TenantId}|{r.FacilityId}|{r.CallId}|{r.InviteTokenHash}|{r.ExpectedDobHash}|{r.OtpHash}|{r.AttemptCount}|{r.Status}|{r.ExpiresAtUtc:O}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    }

    public static string HashAttachment(MessageAttachmentRecord r)
    {
        var raw = $"{r.Id}|{r.TenantId}|{r.FacilityId}|{r.MessageId}|{r.OriginalFileName}|{r.SafeFileName}|{r.ContentType}|{r.OriginalSizeBytes}|{r.SanitizedSizeBytes}|{r.SHA256Checksum}|{r.Status}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    }

    public static string HashOutbox(InteropOutboxRecord r)
    {
        var raw = $"{r.MessageId}|{r.CorrelationId}|{r.Type}|{r.DispatchedAtUtc:O}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    }
}
