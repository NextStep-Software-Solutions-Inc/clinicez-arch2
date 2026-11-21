using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Implements PhilHealth Konsulta (YAKAP) beneficiary masterlist synchronization.
/// Matches clinic patients by normalized 12-digit PIN, updates CustomFields["yakap_enlistments"],
/// maps statutory Active/Transferred status, and preserves pre-allocated control numbers and historical years.
/// </summary>
public class PhilHealthMasterlistSyncService : IPhilHealthMasterlistSyncService
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<PhilHealthMasterlistSyncService>? _logger;
    private readonly IClinicContext? _clinicContext;

    public PhilHealthMasterlistSyncService(
        ApplicationDbContext dbContext,
        ILogger<PhilHealthMasterlistSyncService>? logger = null,
        IClinicContext? clinicContext = null)
    {
        _dbContext = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
        _logger = logger;
        _clinicContext = clinicContext;
    }

    public string? NormalizePin(string? rawPin) => PhilHealthPinNormalizer.Normalize(rawPin);

    public async Task<YakapMasterlistSyncResult> SyncAssignmentsAsync(
        string tenantId,
        Guid? clinicId,
        IEnumerable<YakapMasterlistSyncItem> assignments,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(assignments);

        var assignmentList = assignments.ToList();
        if (assignmentList.Count == 0)
        {
            return new YakapMasterlistSyncResult(0, 0, 0, 0, 0, Array.Empty<string>());
        }

        // 1. Fetch clinic patients with a PhilHealthNumber for this tenant/clinic scope
        IQueryable<Patient> query = _dbContext.Patients.Include(p => p.YakapEnlistments).IgnoreQueryFilters().Where(p => !p.IsDeleted);

        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            query = query.Where(p => p.TenantId == tenantId);
        }

        if (clinicId.HasValue && clinicId.Value != Guid.Empty)
        {
            query = query.Where(p => p.ClinicId == clinicId.Value);
        }

        var patients = await query
            .Where(p => p.PhilHealthNumber != null && p.PhilHealthNumber != "")
            .ToListAsync(ct);

        // 2. Build normalized lookup dictionary (keyed by 12-digit normalized PIN)
        var patientsByPin = new Dictionary<string, List<Patient>>(StringComparer.Ordinal);
        foreach (var patient in patients)
        {
            var normPin = NormalizePin(patient.PhilHealthNumber);
            if (normPin != null)
            {
                if (!patientsByPin.TryGetValue(normPin, out var list))
                {
                    list = new List<Patient>();
                    patientsByPin[normPin] = list;
                }
                list.Add(patient);
            }
        }

        int totalProcessed = 0;
        int matchedCount = 0;
        int activeCount = 0;
        int transferredCount = 0;
        int unmatchedCount = 0;
        var matchedCodes = new List<string>();

        // 3. Process each incoming assignment
        foreach (var item in assignmentList)
        {
            totalProcessed++;
            var normPin = NormalizePin(item.Pin);

            if (normPin == null || !patientsByPin.TryGetValue(normPin, out var matchedPatients))
            {
                unmatchedCount++;
                continue;
            }

            // Determine statutory status
            var status = (item.AssignedStatus == "2" || string.Equals(item.AssignedStatus, "Transferred", StringComparison.OrdinalIgnoreCase))
                ? YakapEnlistmentStatus.Transferred
                : YakapEnlistmentStatus.Active;

            // Determine effective year
            int effYear;
            if (int.TryParse(item.EffectiveYear, out var ey) && ey > 0)
            {
                effYear = ey;
            }
            else if (PhilHealthDateParser.TryNormalizeDate(item.AssignedDate, out var normAssignedDateForYear) &&
                     DateOnly.TryParseExact(normAssignedDateForYear, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var ad))
            {
                effYear = ad.Year;
            }
            else
            {
                effYear = DateTime.UtcNow.Year;
            }

            // Determine statutory dates
            string enlistedAt = PhilHealthDateParser.TryNormalizeDate(item.AssignedDate, out var normAssignedDate)
                ? normAssignedDate!
                : $"{effYear}-01-01";

            string validUntil = $"{effYear}-12-31";

            foreach (var patient in matchedPatients)
            {
                matchedCount++;
                matchedCodes.Add(patient.PatientCode);

                if (status == YakapEnlistmentStatus.Active)
                    activeCount++;
                else
                    transferredCount++;

                var newEnlistment = new PatientYakapEnlistment
                {
                    ClinicId = patient.ClinicId,
                    PatientId = patient.Id,
                    EnlistmentDate = DateOnly.TryParse(enlistedAt, out var parsedEnlistedAt) ? parsedEnlistedAt : new DateOnly(effYear, 1, 1),
                    ValidUntil = DateOnly.TryParse(validUntil, out var parsedValidUntil) ? parsedValidUntil : new DateOnly(effYear, 12, 31),
                    EffectiveYear = effYear,
                    Status = status,
                    Source = YakapEnlistmentSource.PhilHealthMasterlist,
                    PackageType = YakapPackageType.YakapPrimaryCare,
                    CaseNo = null,
                    ProfilingTransNo = null
                };

                // AddOrRenew preserves existing allocated control numbers and historical prior years
                patient.AddOrRenewYakapEnlistment(newEnlistment);
            }
        }

        if (matchedCount > 0)
        {
            await _dbContext.SaveChangesAsync(ct);
            _logger?.LogInformation(
                "[PhilHealthMasterlistSync] Synced {MatchedCount} patients ({Active} active, {Transferred} transferred) out of {Total} masterlist records.",
                matchedCount, activeCount, transferredCount, totalProcessed);
        }

        return new YakapMasterlistSyncResult(
            TotalProcessed: totalProcessed,
            MatchedPatientsCount: matchedCount,
            ActiveEnlistmentsCount: activeCount,
            TransferredCount: transferredCount,
            UnmatchedBeneficiariesCount: unmatchedCount,
            MatchedPatientCodes: matchedCodes);
    }

    public async Task<YakapMasterlistSyncResult> SyncMasterlistDownloadAsync(
        string tenantId,
        Guid? clinicId,
        MasterlistDownloadResponse downloadResponse,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(downloadResponse);

        var items = (downloadResponse.Assignments ?? Array.Empty<MasterlistAssignmentItem>())
            .Select(a => new YakapMasterlistSyncItem(
                Pin: a.PatientPin,
                AssignedDate: a.AssignedDate,
                AssignedStatus: a.Status,
                EffectiveYear: downloadResponse.EffYear,
                LastName: a.LastName,
                FirstName: a.FirstName));

        return await SyncAssignmentsAsync(tenantId, clinicId, items, ct);
    }

    public async Task<int> SyncMasterlistBeneficiariesAsync(
        IEnumerable<YakapBeneficiaryDto> beneficiaries,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(beneficiaries);

        var tenantId = _clinicContext?.TenantId ?? string.Empty;
        var clinicId = _clinicContext?.ClinicId;

        var items = beneficiaries.Select(b => new YakapMasterlistSyncItem(
            Pin: b.PhilHealthIdentificationNumber,
            AssignedDate: b.RegistrationDate,
            AssignedStatus: b.AssignedStatus,
            EffectiveYear: b.EffectivityYear,
            LastName: b.LastName,
            FirstName: b.FirstName));

        var result = await SyncAssignmentsAsync(tenantId, clinicId, items, ct);
        return result.MatchedPatientsCount;
    }
}

/// <summary>
/// Alias / subclass of PhilHealthMasterlistSyncService for direct constructor invocation in tests or consumers.
/// </summary>
public sealed class YakapMasterlistSyncService : PhilHealthMasterlistSyncService
{
    public YakapMasterlistSyncService(
        ApplicationDbContext dbContext,
        IClinicContext? clinicContext = null,
        ILogger<PhilHealthMasterlistSyncService>? logger = null)
        : base(dbContext, logger, clinicContext)
    {
    }
}
