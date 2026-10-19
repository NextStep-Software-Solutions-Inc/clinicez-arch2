using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

internal sealed class NcdQuestionnaireSyncPayload
{
    public Guid? Id { get; set; }
    public Guid PatientId { get; set; }

    public string? Qid1Yn { get; set; }
    public string? Qid2Yn { get; set; }
    public string? Qid3Yn { get; set; }
    public string? Qid4Yn { get; set; }
    public string? Qid5Ynx { get; set; }
    public string? Qid6Yn { get; set; }
    public string? Qid7Yn { get; set; }
    public string? Qid8Yn { get; set; }
    public string? Qid9Yn { get; set; }
    public string? Qid10Yn { get; set; }
    public string? Qid11Yn { get; set; }
    public string? Qid12Yn { get; set; }
    public string? Qid13Yn { get; set; }
    public string? Qid14Yn { get; set; }
    public string? Qid15Yn { get; set; }
    public string? Qid16Yn { get; set; }
    public string? Qid17Abcde { get; set; }
    public string? Qid18Yn { get; set; }

    public string? Qid19Yn { get; set; }
    public decimal? Qid19FbsMgdl { get; set; }
    public decimal? Qid19FbsMmol { get; set; }
    public string? Qid19FbsDate { get; set; }

    public string? Qid20Yn { get; set; }
    public decimal? Qid20CholeVal { get; set; }
    public string? Qid20CholeDate { get; set; }

    public string? Qid21Yn { get; set; }
    public decimal? Qid21KetonVal { get; set; }
    public string? Qid21KetonDate { get; set; }

    public string? Qid22Yn { get; set; }
    public decimal? Qid22ProteinVal { get; set; }
    public string? Qid22ProteinDate { get; set; }

    public string? Qid23Yn { get; set; }
    public string? Qid24Yn { get; set; }

    public DateTime? UpdatedAt { get; set; }
}

public sealed class PatientNcdQuestionnaireSyncProcessor : ISyncEntityProcessor
{
    private readonly ApplicationDbContext _context;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public PatientNcdQuestionnaireSyncProcessor(ApplicationDbContext context)
    {
        _context = context;
    }

    public string EntityType => SyncableEntityTypes.PatientNcdQuestionnaire;

    public async Task<SyncProcessResult> ProcessAsync(SyncLog log, CancellationToken ct)
    {
        if (log.Operation == SyncOperation.Delete)
        {
            if (!log.EntityId.HasValue) return SyncProcessResult.Rejected("EntityId is required for Delete.");
            var toDelete = await _context.PatientNcdQuestionnaires.FindAsync([log.EntityId.Value], ct);
            if (toDelete is not null)
            {
                _context.PatientNcdQuestionnaires.Remove(toDelete);
            }
            return SyncProcessResult.Success();
        }

        if (string.IsNullOrWhiteSpace(log.PayloadJson))
        {
            return SyncProcessResult.Rejected("PayloadJson is required for Create/Update.");
        }

        var payload = JsonSerializer.Deserialize<NcdQuestionnaireSyncPayload>(log.PayloadJson, JsonOptions);
        if (payload is null)
        {
            return SyncProcessResult.Rejected("Failed to deserialize NcdQuestionnaire payload.");
        }

        // Singleton per patient: find by PatientId or EntityId
        var existing = await _context.PatientNcdQuestionnaires
            .FirstOrDefaultAsync(n => n.PatientId == payload.PatientId, ct);

        if (existing is null)
        {
            existing = new PatientNcdQuestionnaire
            {
                Id = payload.Id ?? Guid.NewGuid(),
                PatientId = payload.PatientId,
            };
            ApplyFields(existing, payload);
            await _context.PatientNcdQuestionnaires.AddAsync(existing, ct);
        }
        else
        {
            ApplyFields(existing, payload);
        }

        log.EntityId = existing.Id;
        return SyncProcessResult.Success();
    }

    private static void ApplyFields(PatientNcdQuestionnaire entity, NcdQuestionnaireSyncPayload p)
    {
        entity.Qid1Yn = NormalizeYn(p.Qid1Yn);
        entity.Qid2Yn = NormalizeYn(p.Qid2Yn);
        entity.Qid3Yn = NormalizeYn(p.Qid3Yn);
        entity.Qid4Yn = NormalizeYn(p.Qid4Yn);
        entity.Qid5Ynx = NormalizeYnx(p.Qid5Ynx);
        entity.Qid6Yn = NormalizeYn(p.Qid6Yn);
        entity.Qid7Yn = NormalizeYn(p.Qid7Yn);
        entity.Qid8Yn = NormalizeYn(p.Qid8Yn);
        entity.Qid9Yn = NormalizeYn(p.Qid9Yn);
        entity.Qid10Yn = NormalizeYn(p.Qid10Yn);
        entity.Qid11Yn = NormalizeYn(p.Qid11Yn);
        entity.Qid12Yn = NormalizeYn(p.Qid12Yn);
        entity.Qid13Yn = NormalizeYn(p.Qid13Yn);
        entity.Qid14Yn = NormalizeYn(p.Qid14Yn);
        entity.Qid15Yn = NormalizeYn(p.Qid15Yn);
        entity.Qid16Yn = NormalizeYn(p.Qid16Yn);
        entity.Qid17Abcde = NormalizeAbcde(p.Qid17Abcde);
        entity.Qid18Yn = NormalizeYn(p.Qid18Yn);

        entity.Qid19Yn = NormalizeYn(p.Qid19Yn);
        entity.Qid19FbsMgdl = p.Qid19FbsMgdl;
        entity.Qid19FbsMmol = p.Qid19FbsMmol ?? (p.Qid19FbsMgdl.HasValue ? Math.Round(p.Qid19FbsMgdl.Value / 18.0182m, 2) : null);
        entity.Qid19FbsDate = DateOnly.TryParse(p.Qid19FbsDate, out var fbsD) ? fbsD : null;

        entity.Qid20Yn = NormalizeYn(p.Qid20Yn);
        entity.Qid20CholeVal = p.Qid20CholeVal;
        entity.Qid20CholeDate = DateOnly.TryParse(p.Qid20CholeDate, out var cholD) ? cholD : null;

        entity.Qid21Yn = NormalizeYn(p.Qid21Yn);
        entity.Qid21KetonVal = p.Qid21KetonVal;
        entity.Qid21KetonDate = DateOnly.TryParse(p.Qid21KetonDate, out var ketD) ? ketD : null;

        entity.Qid22Yn = NormalizeYn(p.Qid22Yn);
        entity.Qid22ProteinVal = p.Qid22ProteinVal;
        entity.Qid22ProteinDate = DateOnly.TryParse(p.Qid22ProteinDate, out var protD) ? protD : null;

        entity.Qid23Yn = NormalizeYn(p.Qid23Yn);
        entity.Qid24Yn = NormalizeYn(p.Qid24Yn);

        entity.SyncedAt = DateTime.UtcNow;
    }

    private static string? NormalizeYn(string? val) =>
        string.IsNullOrWhiteSpace(val) ? null :
        val.Trim().Equals("Y", StringComparison.OrdinalIgnoreCase) || val.Trim().Equals("Yes", StringComparison.OrdinalIgnoreCase) ? "Y" :
        val.Trim().Equals("N", StringComparison.OrdinalIgnoreCase) || val.Trim().Equals("No", StringComparison.OrdinalIgnoreCase) ? "N" : null;

    private static string? NormalizeYnx(string? val) =>
        string.IsNullOrWhiteSpace(val) ? null :
        val.Trim().Equals("X", StringComparison.OrdinalIgnoreCase) || val.Trim().Equals("Never", StringComparison.OrdinalIgnoreCase) ? "X" :
        NormalizeYn(val);

    private static string? NormalizeAbcde(string? val)
    {
        if (string.IsNullOrWhiteSpace(val)) return null;
        var upper = val.Trim().ToUpperInvariant();
        return upper is "A" or "B" or "C" or "D" or "E" ? upper : null;
    }
}
