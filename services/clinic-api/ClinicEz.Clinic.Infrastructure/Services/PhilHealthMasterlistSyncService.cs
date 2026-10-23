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
        IQueryable<ClinicPatient> query = _dbContext.Patients.IgnoreQueryFilters().Where(p => !p.IsDeleted);

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
        var patientsByPin = new Dictionary<string, List<ClinicPatient>>(StringComparer.Ordinal);
        foreach (var patient in patients)
        {
            var normPin = NormalizePin(patient.PhilHealthNumber);
            if (normPin != null)
            {
                if (!patientsByPin.TryGetValue(normPin, out var list))
                {
                    list = new List<ClinicPatient>();
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
            string status = (item.AssignedStatus == "2" || string.Equals(item.AssignedStatus, YakapEnlistmentStatus.Transferred, StringComparison.OrdinalIgnoreCase))
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

                var newEnlistment = new YakapEnlistmentEntry
                {
                    EnlistedAt = enlistedAt,
                    ValidUntil = validUntil,
                    EffectiveYear = effYear,
                    Status = status,
                    Source = YakapEnlistmentSource.PhilHealthMasterlist,
                    CaseNo = null,
                    EnlistmentNo = null,
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

    public async Task<YakapMasterlistSyncResult> SyncXmlAsync(
        string tenantId,
        Guid? clinicId,
        string xmlContent,
        string? fallbackEffectiveYear = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(xmlContent))
        {
            return new YakapMasterlistSyncResult(0, 0, 0, 0, 0, Array.Empty<string>());
        }

        var items = new List<YakapMasterlistSyncItem>();
        try
        {
            var doc = XDocument.Parse(xmlContent);
            var root = doc.Root;
            if (root != null)
            {
                var elements = root.Elements()
                    .Where(e => e.Name.LocalName.Equals("ASSIGNMENT", StringComparison.OrdinalIgnoreCase));

                foreach (var el in elements)
                {
                    var pin = el.Attribute("pAssignedPin")?.Value ?? el.Attribute("AssignedPin")?.Value;
                    if (string.IsNullOrWhiteSpace(pin)) continue;

                    var assignedDate = el.Attribute("pAssignedDate")?.Value ?? el.Attribute("AssignedDate")?.Value;
                    var assignedStatus = el.Attribute("pAssignedStatus")?.Value ?? el.Attribute("AssignedStatus")?.Value ?? "1";
                    var effYear = el.Attribute("pEffYear")?.Value ?? el.Attribute("EffectiveYear")?.Value ?? fallbackEffectiveYear;
                    var lName = el.Attribute("pAssignedLastName")?.Value;
                    var fName = el.Attribute("pAssignedFirstName")?.Value;

                    items.Add(new YakapMasterlistSyncItem(pin, assignedDate, assignedStatus, effYear, lName, fName));
                }
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "[PhilHealthMasterlistSync] Failed to parse masterlist XML content.");
            throw;
        }

        return await SyncAssignmentsAsync(tenantId, clinicId, items, ct);
    }

    public async Task<YakapMasterlistSyncResult> SyncProxyResponseAsync(
        string tenantId,
        Guid? clinicId,
        YakapMasterlistProxyResponse proxyResponse,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(proxyResponse);

        // Prefer RawXml if available
        if (!string.IsNullOrWhiteSpace(proxyResponse.RawXml))
        {
            return await SyncXmlAsync(tenantId, clinicId, proxyResponse.RawXml, proxyResponse.EffectiveYear, ct);
        }

        // Fallback to Beneficiaries collection
        var items = (proxyResponse.Beneficiaries ?? Array.Empty<YakapBeneficiaryDto>()).Select(b => new YakapMasterlistSyncItem(
            Pin: b.PhilHealthIdentificationNumber,
            AssignedDate: b.RegistrationDate,
            AssignedStatus: b.AssignedStatus,
            EffectiveYear: !string.IsNullOrWhiteSpace(b.EffectivityYear) ? b.EffectivityYear : proxyResponse.EffectiveYear,
            LastName: b.LastName,
            FirstName: b.FirstName));

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
