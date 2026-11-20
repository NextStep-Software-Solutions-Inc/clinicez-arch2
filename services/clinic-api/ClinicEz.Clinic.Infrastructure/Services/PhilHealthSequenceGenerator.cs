using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Generates 23-character PhilHealth PCAPI v2.0 (rev20261026) 23B daily sequences
/// using Asia/Manila dates stored in <see cref="PhilHealthDailySequence"/>.
/// Format: {Prefix:1}{AccreNo:9}{yyyyMMdd:8}{Sequence:D5} = 23 chars.
/// </summary>
public sealed class PhilHealthSequenceGenerator : ClinicEz.Clinic.Domain.Interfaces.IPhilHealthSequenceGenerator
{
    private static readonly TimeZoneInfo ManilaTimeZone = ResolveManilaTimeZone();
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<PhilHealthSequenceGenerator> _logger;

    public PhilHealthSequenceGenerator(
        ApplicationDbContext dbContext,
        ILogger<PhilHealthSequenceGenerator> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public Task<string> GenerateCaseNumberAsync(
        string tenantId,
        Guid clinicId,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default) =>
        GenerateTransactionNumberAsync(tenantId, clinicId, PhilHealthSequenceType.Case, accreditationNumber, effectiveYear, ct);

    public async Task<string> GenerateTransactionNumberAsync(
        string tenantId,
        Guid clinicId,
        PhilHealthSequenceType type,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default)
    {
        var manilaDate = ResolveManilaDate(effectiveYear, referenceDate: null);
        return await GenerateForDateAsync(tenantId, clinicId, type, accreditationNumber, manilaDate, ct);
    }

    private async Task<string> GenerateForDateAsync(
        string tenantId,
        Guid clinicId,
        PhilHealthSequenceType type,
        string accreditationNumber,
        DateOnly manilaDate,
        CancellationToken ct)
    {
        var accreClean = SanitizeAccreditation9(accreditationNumber);
        var prefix = MapPrefix(type);
        var seq = await GetNextDailySequenceAsync(tenantId, clinicId, accreClean, prefix, manilaDate, ct);
        return $"{prefix}{accreClean}{manilaDate:yyyyMMdd}{seq:D5}";
    }

    public Task<PhilHealthPatientJourneyNumbers> AssignPatientJourneyNumbersAsync(
        string tenantId,
        Guid clinicId,
        Guid patientId,
        Guid? encounterId,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct) =>
        AssignPatientJourneyNumbersAsync(tenantId, clinicId, patientId, encounterId, accreditationNumber, effectiveYear, referenceDate: null, ct);

    public async Task<PhilHealthPatientJourneyNumbers> AssignPatientJourneyNumbersAsync(
        string tenantId,
        Guid clinicId,
        Guid patientId,
        Guid? encounterId,
        string accreditationNumber,
        string effectiveYear,
        DateTime? referenceDate = null,
        CancellationToken ct = default)
    {
        var patient = await _dbContext.Patients
            .Include(p => p.YakapEnlistments)
            .FirstOrDefaultAsync(p => p.Id == patientId, ct);

        if (patient == null)
        {
            throw new InvalidOperationException($"Patient {patientId} not found.");
        }

        ConsultationEncounter? encounter = null;
        if (encounterId.HasValue)
        {
            encounter = await _dbContext.Consultations
                .FirstOrDefaultAsync(e => e.Id == encounterId.Value, ct);
        }

        int? requestedYear = int.TryParse(effectiveYear, out var ey) ? ey : null;
        PatientYakapEnlistment activeEntry;

        if (encounter != null || referenceDate.HasValue)
        {
            var refDate = encounter != null
                ? DateOnly.FromDateTime(encounter.EncounterDate)
                : DateOnly.FromDateTime(referenceDate!.Value);

            activeEntry = patient.ResolveActiveEnlistmentOrThrow(refDate, requestedYear);
        }
        else
        {
            var targetYear = requestedYear ?? DateTime.UtcNow.Year;
            activeEntry = patient.ResolveActiveEnlistmentForYearOrThrow(targetYear);
        }

        var manilaDate = ResolveManilaDate(
            activeEntry.EffectiveYear > 0 ? activeEntry.EffectiveYear.ToString() : effectiveYear,
            encounter?.EncounterDate ?? referenceDate);

        bool patientModified = false;

        // 1. Assign Patient Annual Case Number (C...) if missing
        var currentCaseNo = activeEntry.CaseNo;
        if (string.IsNullOrWhiteSpace(currentCaseNo))
        {
            currentCaseNo = await GenerateForDateAsync(tenantId, clinicId, PhilHealthSequenceType.Case, accreditationNumber, manilaDate, ct);
            activeEntry.CaseNo = currentCaseNo;
            patientModified = true;
        }

        // 2. Assign Profiling / FPE Transaction Number (P...) if missing
        var currentProfNo = activeEntry.ProfilingTransNo;
        if (string.IsNullOrWhiteSpace(currentProfNo))
        {
            currentProfNo = await GenerateForDateAsync(tenantId, clinicId, PhilHealthSequenceType.Profiling, accreditationNumber, manilaDate, ct);
            activeEntry.ProfilingTransNo = currentProfNo;
            patientModified = true;
        }

        if (patientModified)
        {
            patient.AddOrRenewYakapEnlistment(activeEntry);
            await _dbContext.SaveChangesAsync(ct);
            _logger.LogInformation(
                "Assigned PhilHealth YAKAP 2.0 23B numbers to patient {PatientId}: Case={CaseNo}, Profiling={ProfNo}",
                patient.Id, currentCaseNo, currentProfNo);
        }

        // 3. Assign Consultation / SOAP Transaction Number (S...) if encounter is specified
        string? soapTransNo = null;
        if (encounter != null)
        {
            encounter.PhilHealthCaseNo = currentCaseNo;

            if (string.IsNullOrWhiteSpace(encounter.PhilHealthSoapTransNo))
            {
                encounter.PhilHealthSoapTransNo = await GenerateForDateAsync(
                    tenantId,
                    clinicId,
                    PhilHealthSequenceType.Consultation,
                    accreditationNumber,
                    manilaDate,
                    ct);
            }

            await _dbContext.SaveChangesAsync(ct);
            soapTransNo = encounter.PhilHealthSoapTransNo;
        }

        return new PhilHealthPatientJourneyNumbers(
            CaseNumber: currentCaseNo!,
            ProfilingTransactionNumber: currentProfNo!,
            SoapTransactionNumber: soapTransNo);
    }

    private async Task<long> GetNextDailySequenceAsync(
        string tenantId,
        Guid clinicId,
        string accreditationNo,
        string prefix,
        DateOnly manilaDate,
        CancellationToken ct)
    {
        var tracker = await _dbContext.PhilHealthDailySequences
            .FirstOrDefaultAsync(t =>
                t.ClinicId == clinicId &&
                t.AccreditationNo == accreditationNo &&
                t.Prefix == prefix &&
                t.ManilaDate == manilaDate &&
                !t.IsDeleted, ct);

        if (tracker == null)
        {
            tracker = new PhilHealthDailySequence
            {
                Id = Guid.NewGuid(),
                TenantId = string.IsNullOrWhiteSpace(tenantId) ? "tenant_default" : tenantId,
                ClinicId = clinicId,
                AccreditationNo = accreditationNo,
                Prefix = prefix,
                ManilaDate = manilaDate,
                LastValue = 1
            };
            _dbContext.PhilHealthDailySequences.Add(tracker);
        }
        else
        {
            tracker.LastValue++;
        }

        await _dbContext.SaveChangesAsync(ct);
        return tracker.LastValue;
    }

    private static string MapPrefix(PhilHealthSequenceType type) => type switch
    {
        PhilHealthSequenceType.Case => "C",
        PhilHealthSequenceType.Profiling => "P",
        PhilHealthSequenceType.Consultation => "S",
        PhilHealthSequenceType.DiagnosticRequest => "D",
        PhilHealthSequenceType.DiagnosticResults => "L",
        PhilHealthSequenceType.Medicine => "M",
        PhilHealthSequenceType.Referral => "R",
        _ => "C"
    };

    private static DateOnly ResolveManilaDate(string? effectiveYear, DateTime? referenceDate)
    {
        if (referenceDate.HasValue)
        {
            var utc = referenceDate.Value.Kind == DateTimeKind.Utc
                ? referenceDate.Value
                : referenceDate.Value.ToUniversalTime();
            return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utc, ManilaTimeZone));
        }

        var manilaToday = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ManilaTimeZone));
        if (int.TryParse(effectiveYear, out var yr) && yr > 0 && yr != manilaToday.Year)
        {
            return new DateOnly(yr, manilaToday.Month, Math.Min(manilaToday.Day, DateTime.DaysInMonth(yr, manilaToday.Month)));
        }

        return manilaToday;
    }

    private static string SanitizeAccreditation9(string? accreditationNumber)
    {
        if (string.IsNullOrWhiteSpace(accreditationNumber))
        {
            return "H00000001";
        }

        var clean = new string(accreditationNumber
            .Trim()
            .ToUpperInvariant()
            .Where(char.IsLetterOrDigit)
            .ToArray());

        if (clean.Length == 0)
        {
            return "H00000001";
        }

        return clean.Length >= 9
            ? clean[^9..]
            : clean.PadLeft(9, '0');
    }

    private static TimeZoneInfo ResolveManilaTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Asia/Manila");
        }
        catch
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Singapore Standard Time");
            }
            catch
            {
                return TimeZoneInfo.CreateCustomTimeZone("Asia/Manila", TimeSpan.FromHours(8), "Philippine Standard Time", "Philippine Standard Time");
            }
        }
    }
}
