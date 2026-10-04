using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

// Mobile schema is a single-row record with all government IDs as separate fields:
// philhealthId, philhealthCategory, sssNumber, gsisNumber, pagibigId, tin,
// seniorCitizenId, isPwd, pwdIdNumber, disabilityType,
// hmoProvider, hmoPolicyNumber, hmoPlanType, hmoCoverageStart, hmoCoverageEnd
// Backend entity: one row per ID type (IdType enum + IdNumber)
// Strategy: expand each non-null ID on the mobile into a separate backend record
internal sealed class GovernmentIdPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    // The mobile sends one-row-per-entity type from the sync queue
    // So we accept both the flat record AND the simple IdType+IdNumber pattern
    public string? IdType { get; set; }     // used when mobile sends a per-row record
    public string? IdNumber { get; set; }
    public DateOnly? IssuedAt { get; set; }
    public DateOnly? ExpiresAt { get; set; }
    // Flat PhilHealth / multi-ID fields (when mobile sends the whole row)
    public string? PhilhealthId { get; set; }
    public string? PhilhealthCategory { get; set; }
    public string? SssNumber { get; set; }
    public string? GsisNumber { get; set; }
    public string? PagibigId { get; set; }
    public string? Tin { get; set; }
    public string? SeniorCitizenId { get; set; }
    public string? PwdIdNumber { get; set; }
    public string? HmoPolicyNumber { get; set; }
    public string? SponsorPin { get; set; }
    public string? SponsorLastName { get; set; }
    public string? SponsorFirstName { get; set; }
    public string? SponsorMiddleName { get; set; }
    public string? SponsorSuffix { get; set; }
    public DateOnly? SponsorDob { get; set; }
    public string? SponsorRelationship { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientGovernmentIdSyncProcessor
    : SimpleListSyncProcessor<PatientGovernmentId, GovernmentIdPayload>
{
    public PatientGovernmentIdSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientGovernmentId;

    protected override async Task<PatientGovernmentId?> FindExistingAsync(GovernmentIdPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientGovernmentIds.FindAsync([id.Value], ct)
            : await Context.PatientGovernmentIds.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientGovernmentId CreateFromPayload(GovernmentIdPayload p)
    {
        // If mobile sends explicit IdType+IdNumber, use that directly
        if (p.IdType is not null && p.IdNumber is not null)
        {
            return new()
            {
                ClientId = p.ClientId, PatientId = p.PatientId,
                IdType = Enum.TryParse<GovernmentIdType>(p.IdType, true, out var t) ? t : GovernmentIdType.PhilSys,
                IdNumber = p.IdNumber, IssuedAt = p.IssuedAt, ExpiresAt = p.ExpiresAt,
                PhilhealthCategory = p.PhilhealthCategory,
                SponsorPin = p.SponsorPin,
                SponsorLastName = p.SponsorLastName,
                SponsorFirstName = p.SponsorFirstName,
                SponsorMiddleName = p.SponsorMiddleName,
                SponsorSuffix = p.SponsorSuffix,
                SponsorDob = p.SponsorDob,
                SponsorRelationship = p.SponsorRelationship
            };
        }
        // Otherwise use the first non-null ID from the flat record
        var (type, number) = ResolveFirstId(p);
        return new()
        {
            ClientId = p.ClientId, PatientId = p.PatientId,
            IdType = type, IdNumber = number ?? string.Empty,
            PhilhealthCategory = type == GovernmentIdType.PhilHealth ? p.PhilhealthCategory : null,
            SponsorPin = type == GovernmentIdType.PhilHealth ? p.SponsorPin : null,
            SponsorLastName = type == GovernmentIdType.PhilHealth ? p.SponsorLastName : null,
            SponsorFirstName = type == GovernmentIdType.PhilHealth ? p.SponsorFirstName : null,
            SponsorMiddleName = type == GovernmentIdType.PhilHealth ? p.SponsorMiddleName : null,
            SponsorSuffix = type == GovernmentIdType.PhilHealth ? p.SponsorSuffix : null,
            SponsorDob = type == GovernmentIdType.PhilHealth ? p.SponsorDob : null,
            SponsorRelationship = type == GovernmentIdType.PhilHealth ? p.SponsorRelationship : null
        };
    }

    protected override void ApplyUpdate(PatientGovernmentId e, GovernmentIdPayload p)
    {
        if (p.IdType is not null && p.IdNumber is not null)
        {
            e.IdType = Enum.TryParse<GovernmentIdType>(p.IdType, true, out var t) ? t : e.IdType;
            e.IdNumber = p.IdNumber;
            e.IssuedAt = p.IssuedAt;
            e.ExpiresAt = p.ExpiresAt;
            if (e.IdType == GovernmentIdType.PhilHealth)
            {
                e.PhilhealthCategory = p.PhilhealthCategory;
                e.SponsorPin = p.SponsorPin;
                e.SponsorLastName = p.SponsorLastName;
                e.SponsorFirstName = p.SponsorFirstName;
                e.SponsorMiddleName = p.SponsorMiddleName;
                e.SponsorSuffix = p.SponsorSuffix;
                e.SponsorDob = p.SponsorDob;
                e.SponsorRelationship = p.SponsorRelationship;
            }
            return;
        }
        var (type, number) = ResolveFirstId(p);
        e.IdType = type;
        e.IdNumber = number ?? e.IdNumber;
        if (type == GovernmentIdType.PhilHealth)
        {
            e.PhilhealthCategory = p.PhilhealthCategory;
            e.SponsorPin = p.SponsorPin;
            e.SponsorLastName = p.SponsorLastName;
            e.SponsorFirstName = p.SponsorFirstName;
            e.SponsorMiddleName = p.SponsorMiddleName;
            e.SponsorSuffix = p.SponsorSuffix;
            e.SponsorDob = p.SponsorDob;
            e.SponsorRelationship = p.SponsorRelationship;
        }
    }

    private static (GovernmentIdType type, string? number) ResolveFirstId(GovernmentIdPayload p)
    {
        if (p.PhilhealthId is not null) return (GovernmentIdType.PhilHealth, p.PhilhealthId);
        if (p.SssNumber is not null) return (GovernmentIdType.SSS, p.SssNumber);
        if (p.GsisNumber is not null) return (GovernmentIdType.GSIS, p.GsisNumber);
        if (p.PagibigId is not null) return (GovernmentIdType.PagIbig, p.PagibigId);
        if (p.Tin is not null) return (GovernmentIdType.TIN, p.Tin);
        if (p.SeniorCitizenId is not null) return (GovernmentIdType.SeniorCitizen, p.SeniorCitizenId);
        if (p.PwdIdNumber is not null) return (GovernmentIdType.PWD, p.PwdIdNumber);
        if (p.HmoPolicyNumber is not null) return (GovernmentIdType.HMO, p.HmoPolicyNumber);
        return (GovernmentIdType.PhilSys, null);
    }

    protected override DateTime GetPayloadTimestamp(GovernmentIdPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientGovernmentId e) => log.EntityId = e.Id;
}
