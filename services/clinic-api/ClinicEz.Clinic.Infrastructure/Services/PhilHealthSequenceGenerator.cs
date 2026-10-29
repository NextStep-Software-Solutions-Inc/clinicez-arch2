using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class PhilHealthSequenceGenerator : ClinicEz.Clinic.Domain.Interfaces.IPhilHealthSequenceGenerator
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<PhilHealthSequenceGenerator> _logger;

    public PhilHealthSequenceGenerator(
        ApplicationDbContext dbContext,
        ILogger<PhilHealthSequenceGenerator> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<string> GenerateCaseNumberAsync(
        string tenantId,
        Guid clinicId,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default)
    {
        var seq = await GetNextSequenceAsync(tenantId, clinicId, PhilHealthSequenceType.Case, effectiveYear, ct);
        var accreClean = SanitizeAccreditation(accreditationNumber);
        var yearClean = string.IsNullOrWhiteSpace(effectiveYear) ? DateTime.UtcNow.Year.ToString() : effectiveYear;
        return $"C{accreClean}{yearClean}{seq:D5}";
    }

    public async Task<string> GenerateTransactionNumberAsync(
        string tenantId,
        Guid clinicId,
        PhilHealthSequenceType type,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default)
    {
        var seq = await GetNextSequenceAsync(tenantId, clinicId, type, effectiveYear, ct);
        var accreClean = SanitizeAccreditation(accreditationNumber);
        var yearClean = string.IsNullOrWhiteSpace(effectiveYear) ? DateTime.UtcNow.Year.ToString() : effectiveYear;

        char prefix = type switch
        {
            PhilHealthSequenceType.Enlistment => 'E',
            PhilHealthSequenceType.Profiling => 'P',
            PhilHealthSequenceType.Soap => 'S',
            PhilHealthSequenceType.Medicine => 'M',
            PhilHealthSequenceType.Transmittal => 'R',
            _ => 'T'
        };

        return $"{prefix}{accreClean}{yearClean}{seq:D5}";
    }

    public async Task<string> GenerateTransmittalNumberAsync(
        string tenantId,
        Guid clinicId,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default)
    {
        return await GenerateTransactionNumberAsync(
            tenantId,
            clinicId,
            PhilHealthSequenceType.Transmittal,
            accreditationNumber,
            effectiveYear,
            ct);
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
            // Encounter mode: refDate derived from encounter.EncounterDate -> referenceDate -> DateTime.UtcNow.Date
            var refDate = encounter != null
                ? DateOnly.FromDateTime(encounter.EncounterDate)
                : (referenceDate.HasValue
                    ? DateOnly.FromDateTime(referenceDate.Value)
                    : DateOnly.FromDateTime(DateTime.UtcNow));

            activeEntry = patient.ResolveActiveEnlistmentOrThrow(refDate, requestedYear);
        }
        else
        {
            // Patient Registration Mode: encounter == null && !referenceDate.HasValue
            var targetYear = requestedYear ?? DateTime.UtcNow.Year;
            activeEntry = patient.ResolveActiveEnlistmentForYearOrThrow(targetYear);
        }

        var yearClean = activeEntry.EffectiveYear > 0
            ? activeEntry.EffectiveYear.ToString()
            : (!string.IsNullOrWhiteSpace(effectiveYear) ? effectiveYear : DateTime.UtcNow.Year.ToString());

        bool patientModified = false;

        // 1. Assign Patient Annual Case Number if missing on active entry
        var currentCaseNo = activeEntry.CaseNo;
        if (string.IsNullOrWhiteSpace(currentCaseNo))
        {
            currentCaseNo = await GenerateCaseNumberAsync(tenantId, clinicId, accreditationNumber, yearClean, ct);
            activeEntry.CaseNo = currentCaseNo;
            patientModified = true;
        }

        // 2. Assign Enlistment Transaction Number if missing on active entry
        var currentEnlistNo = activeEntry.EnlistmentTransNo;
        if (string.IsNullOrWhiteSpace(currentEnlistNo))
        {
            currentEnlistNo = await GenerateTransactionNumberAsync(
                tenantId,
                clinicId,
                PhilHealthSequenceType.Enlistment,
                accreditationNumber,
                yearClean,
                ct);
            activeEntry.EnlistmentTransNo = currentEnlistNo;
            patientModified = true;
        }

        // 3. Assign Profiling Transaction Number if missing on active entry
        var currentProfNo = activeEntry.ProfilingTransNo;
        if (string.IsNullOrWhiteSpace(currentProfNo))
        {
            currentProfNo = await GenerateTransactionNumberAsync(
                tenantId,
                clinicId,
                PhilHealthSequenceType.Profiling,
                accreditationNumber,
                yearClean,
                ct);
            activeEntry.ProfilingTransNo = currentProfNo;
            patientModified = true;
        }

        if (patientModified)
        {
            patient.AddOrRenewYakapEnlistment(activeEntry);
            await _dbContext.SaveChangesAsync(ct);
            _logger.LogInformation(
                "Assigned PhilHealth Journey Numbers to patient {PatientId}: Case={CaseNo}, Enlist={EnlistNo}, Prof={ProfNo}",
                patient.Id, currentCaseNo, currentEnlistNo, currentProfNo);
        }

        // 4. Assign Encounter SOAP Transaction Number if an encounter is specified
        string? soapTransNo = null;
        if (encounter != null)
        {
            encounter.PhilHealthCaseNo = currentCaseNo;

            if (string.IsNullOrWhiteSpace(encounter.PhilHealthSoapTransNo))
            {
                encounter.PhilHealthSoapTransNo = await GenerateTransactionNumberAsync(
                    tenantId,
                    clinicId,
                    PhilHealthSequenceType.Soap,
                    accreditationNumber,
                    yearClean,
                    ct);
            }
            await _dbContext.SaveChangesAsync(ct);
            soapTransNo = encounter.PhilHealthSoapTransNo;
        }

        return new PhilHealthPatientJourneyNumbers(
            CaseNumber: currentCaseNo!,
            EnlistmentTransactionNumber: currentEnlistNo!,
            ProfilingTransactionNumber: currentProfNo!,
            SoapTransactionNumber: soapTransNo);
    }

    private async Task<int> GetNextSequenceAsync(
        string tenantId,
        Guid clinicId,
        PhilHealthSequenceType sequenceType,
        string effectiveYear,
        CancellationToken ct)
    {
        var tracker = await _dbContext.PhilHealthSequenceTrackers
            .FirstOrDefaultAsync(t =>
                t.TenantId == tenantId &&
                t.ClinicId == clinicId &&
                t.SequenceType == sequenceType &&
                t.EffectiveYear == effectiveYear, ct);

        if (tracker == null)
        {
            tracker = new PhilHealthSequenceTracker
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                SequenceType = sequenceType,
                EffectiveYear = effectiveYear,
                CurrentSequence = 1,
                LastAssignedAt = DateTime.UtcNow
            };
            _dbContext.PhilHealthSequenceTrackers.Add(tracker);
        }
        else
        {
            tracker.CurrentSequence++;
            tracker.LastAssignedAt = DateTime.UtcNow;
        }

        await _dbContext.SaveChangesAsync(ct);
        return tracker.CurrentSequence;
    }

    private static string SanitizeAccreditation(string? accreditationNumber)
    {
        if (string.IsNullOrWhiteSpace(accreditationNumber))
        {
            return "000921";
        }

        var clean = accreditationNumber
            .Replace("-", string.Empty)
            .Replace("HCI", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("NCR", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Trim();

        return clean.Length > 6 ? clean.Substring(clean.Length - 6) : clean.PadLeft(6, '0');
    }
}
