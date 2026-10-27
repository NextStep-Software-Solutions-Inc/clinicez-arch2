using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Comms.Infrastructure.Services;

public sealed class TranscriptSerializer : ITranscriptSerializer
{
    public SerializedTranscript Serialize(
        Conversation conversation,
        IReadOnlyList<Participant> participants,
        IReadOnlyList<Message> messages)
    {
        // STRICT PRIVACY RULE: Filter public messages ONLY; internal staff notes are NEVER exported to patient chart transcripts.
        var publicMessages = messages
            .Where(m => m.Visibility == MessageVisibility.Public)
            .OrderBy(m => m.Seq)
            .ToList();

        var participantDtos = participants
            .Select(p => new TranscriptParticipantDto(
                ParticipantId: p.Id,
                Identity: p.ParticipantId,
                Role: p.Role,
                DisplayName: p.DisplayName,
                JoinedAtUtc: p.JoinedAtUtc))
            .ToList();

        var messageDtos = publicMessages
            .Select(m => new TranscriptMessageDto(
                MessageId: m.Id,
                Seq: m.Seq,
                SenderType: m.SenderType,
                SenderDisplayName: m.SenderDisplayName,
                ServerReceivedAtUtc: m.ServerReceivedAtUtc,
                ContentText: m.ContentText,
                RequiresAcknowledgement: m.RequiresAcknowledgement,
                IsAcknowledged: m.IsAcknowledged,
                AcknowledgedAtUtc: m.AcknowledgedAtUtc,
                AcknowledgedByName: m.AcknowledgedByName,
                Attachments: m.Attachments
                    .Where(a => a.Status == AttachmentStatus.Clean)
                    .Select(a => new TranscriptAttachmentDto(
                        AttachmentId: a.Id,
                        SafeFileName: a.SafeFileName,
                        ContentType: a.ContentType,
                        FileSizeBytes: a.SanitizedSizeBytes > 0 ? a.SanitizedSizeBytes : a.OriginalSizeBytes,
                        SHA256Checksum: a.SHA256Checksum))
                    .ToList()))
            .ToList();

        var exportedAtUtc = DateTime.UtcNow;

        var prelimDoc = new PatientCommunicationTranscriptDocument(
            ConversationId: conversation.Id,
            TenantId: conversation.TenantId,
            FacilityId: conversation.FacilityId,
            FacilityType: "Clinic",
            PatientId: conversation.PatientId ?? Guid.Empty,
            ContextType: conversation.ContextType,
            ContextId: conversation.ContextId,
            Category: conversation.Category?.ToString() ?? "General",
            Title: conversation.Title,
            CreatedAtUtc: conversation.CreatedAtUtc,
            ClosedAtUtc: conversation.ClosedAtUtc ?? exportedAtUtc,
            ClosedByStaffId: conversation.ClosedBy,
            ClosedByStaffName: conversation.ClosedBy,
            TriageDisposition: conversation.TriageDisposition?.ToString(),
            DeclineReasonCode: conversation.DeclineReasonCode,
            Participants: participantDtos,
            Messages: messageDtos,
            TranscriptSha256: string.Empty,
            ExportedAtUtc: exportedAtUtc);

        var prelimJson = JsonSerializer.Serialize(prelimDoc, InteropJson.Options);
        var sha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(prelimJson))).ToLowerInvariant();

        var finalDoc = prelimDoc with { TranscriptSha256 = sha256 };
        var finalJson = JsonSerializer.Serialize(finalDoc, InteropJson.Options);

        var markdown = BuildMarkdown(finalDoc);

        return new SerializedTranscript(finalDoc, finalJson, markdown, sha256);
    }

    private static string BuildMarkdown(PatientCommunicationTranscriptDocument doc)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"# Patient Communication Transcript — {doc.Title}");
        sb.AppendLine();
        sb.AppendLine("| Field | Value |");
        sb.AppendLine("|---|---|");
        sb.AppendLine($"| Conversation ID | `{doc.ConversationId}` |");
        sb.AppendLine($"| Tenant ID | `{doc.TenantId}` |");
        sb.AppendLine($"| Facility ID | `{doc.FacilityId}` |");
        sb.AppendLine($"| Patient ID | `{doc.PatientId}` |");
        sb.AppendLine($"| Category | {doc.Category} |");
        sb.AppendLine($"| Status / Disposition | {doc.TriageDisposition ?? "Closed"} |");
        if (!string.IsNullOrWhiteSpace(doc.DeclineReasonCode))
        {
            sb.AppendLine($"| Decline Reason | `{doc.DeclineReasonCode}` |");
        }
        sb.AppendLine($"| Opened At (UTC) | {doc.CreatedAtUtc:yyyy-MM-dd HH:mm:ss} UTC |");
        sb.AppendLine($"| Closed At (UTC) | {doc.ClosedAtUtc:yyyy-MM-dd HH:mm:ss} UTC |");
        sb.AppendLine($"| Closed By | {doc.ClosedByStaffName ?? "System"} |");
        sb.AppendLine($"| Transcript SHA-256 | `{doc.TranscriptSha256}` |");
        sb.AppendLine();

        sb.AppendLine("## Participants");
        sb.AppendLine();
        sb.AppendLine("| Display Name | Role | Identity | Joined At (UTC) |");
        sb.AppendLine("|---|---|---|---|");
        foreach (var p in doc.Participants)
        {
            sb.AppendLine($"| {p.DisplayName} | {p.Role} | `{p.Identity}` | {p.JoinedAtUtc:yyyy-MM-dd HH:mm:ss} |");
        }
        sb.AppendLine();

        sb.AppendLine("## Chronological Messages");
        sb.AppendLine();
        if (doc.Messages.Count == 0)
        {
            sb.AppendLine("*No public messages recorded in this conversation.*");
        }
        else
        {
            foreach (var m in doc.Messages)
            {
                sb.AppendLine($"### [Seq {m.Seq}] {m.SenderDisplayName} ({m.SenderType}) — {m.ServerReceivedAtUtc:yyyy-MM-dd HH:mm:ss} UTC");
                sb.AppendLine();
                sb.AppendLine(m.ContentText);
                sb.AppendLine();

                if (m.Attachments.Count > 0)
                {
                    sb.AppendLine("**Attachments:**");
                    foreach (var att in m.Attachments)
                    {
                        sb.AppendLine($"- `{att.SafeFileName}` ({att.ContentType}, {att.FileSizeBytes} bytes, SHA256: `{att.SHA256Checksum}`)");
                    }
                    sb.AppendLine();
                }

                if (m.IsAcknowledged)
                {
                    sb.AppendLine($"> *Acknowledged by {m.AcknowledgedByName} at {m.AcknowledgedAtUtc:yyyy-MM-dd HH:mm:ss} UTC*");
                    sb.AppendLine();
                }
            }
        }

        return sb.ToString();
    }
}
