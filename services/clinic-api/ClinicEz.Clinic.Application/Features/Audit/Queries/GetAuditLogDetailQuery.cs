namespace ClinicEz.Clinic.Application.Features.Audit.Queries;

using System;
using System.Collections.Generic;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Audit.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

public sealed record GetAuditLogDetailQuery(Guid Id) : IRequest<ClinicAuditEntryDetailDto?>;

public sealed class GetAuditLogDetailQueryHandler : IRequestHandler<GetAuditLogDetailQuery, ClinicAuditEntryDetailDto?>
{
    private readonly IRepository<ClinicAuditEntry> _auditRepo;

    public GetAuditLogDetailQueryHandler(IRepository<ClinicAuditEntry> auditRepo)
    {
        _auditRepo = auditRepo ?? throw new ArgumentNullException(nameof(auditRepo));
    }

    public async Task<ClinicAuditEntryDetailDto?> Handle(GetAuditLogDetailQuery request, CancellationToken cancellationToken)
    {
        var entry = await _auditRepo.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == request.Id, cancellationToken);

        if (entry == null) return null;

        var checksums = ExtractProseChecksums(entry.MetadataJson);

        return new ClinicAuditEntryDetailDto(
            Id: entry.Id,
            TenantId: entry.TenantId,
            ClinicId: entry.ClinicId,
            Timestamp: entry.Timestamp,
            Category: entry.Category,
            Severity: entry.Severity,
            Action: entry.Action,
            ActorStaffId: entry.ActorStaffId,
            ActorName: entry.ActorName,
            ActorRole: entry.ActorRole,
            ClientIpAddress: entry.ClientIpAddress,
            UserAgent: entry.UserAgent,
            TargetEntityType: entry.TargetEntityType,
            TargetEntityId: entry.TargetEntityId,
            PatientId: entry.PatientId,
            PatientNameMasked: entry.PatientNameMasked,
            PatientPinMasked: entry.PatientPinMasked,
            Outcome: entry.Outcome,
            Description: entry.Description,
            MetadataJson: entry.MetadataJson ?? "{}",
            ProseChecksums: checksums,
            CreatedAt: entry.CreatedAt);
    }

    private static IReadOnlyDictionary<string, string> ExtractProseChecksums(string? metadataJson)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(metadataJson) || metadataJson == "{}")
            return result;

        try
        {
            var node = JsonNode.Parse(metadataJson);
            if (node is JsonObject obj)
            {
                CollectChecksumsRecursive(obj, result, "");
            }
        }
        catch
        {
            // Defensive: invalid or non-JSON metadata does not crash detail retrieval
        }

        return result;
    }

    private static void CollectChecksumsRecursive(JsonObject obj, Dictionary<string, string> target, string prefix)
    {
        foreach (var kvp in obj)
        {
            var key = string.IsNullOrEmpty(prefix) ? kvp.Key : $"{prefix}.{kvp.Key}";
            if (kvp.Value is JsonValue val && val.TryGetValue<string>(out var strVal))
            {
                if (kvp.Key.EndsWith("Checksum", StringComparison.OrdinalIgnoreCase) ||
                    strVal.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase))
                {
                    target[key] = strVal;
                }
            }
            else if (kvp.Value is JsonObject childObj)
            {
                CollectChecksumsRecursive(childObj, target, key);
            }
        }
    }
}
