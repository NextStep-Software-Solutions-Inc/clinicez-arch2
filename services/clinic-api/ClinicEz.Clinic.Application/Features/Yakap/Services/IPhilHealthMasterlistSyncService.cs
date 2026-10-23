using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;

namespace ClinicEz.Clinic.Application.Features.Yakap.Services;

/// <summary>
/// Represents a normalized masterlist assignment item from PhilHealth.
/// </summary>
public sealed record YakapMasterlistSyncItem(
    string Pin,
    string? AssignedDate,
    string? AssignedStatus,
    string? EffectiveYear,
    string? LastName = null,
    string? FirstName = null);

/// <summary>
/// Summary of masterlist synchronization execution.
/// </summary>
public sealed record YakapMasterlistSyncResult(
    int TotalProcessed,
    int MatchedPatientsCount,
    int ActiveEnlistmentsCount,
    int TransferredCount,
    int UnmatchedBeneficiariesCount,
    IReadOnlyList<string> MatchedPatientCodes);

/// <summary>
/// Service interface for synchronizing PhilHealth Konsulta (YAKAP) masterlist beneficiaries
/// into clinic patient records (CustomFields["yakap_enlistments"]).
/// </summary>
public interface IPhilHealthMasterlistSyncService
{
    /// <summary>
    /// Normalizes a PhilHealth PIN to a 12-digit string suitable for deterministic matching.
    /// Returns null if the PIN is invalid, empty, or all zeros.
    /// </summary>
    string? NormalizePin(string? rawPin);

    /// <summary>
    /// Synchronizes a collection of masterlist assignment records into the clinic's patient database.
    /// </summary>
    Task<YakapMasterlistSyncResult> SyncAssignmentsAsync(
        string tenantId,
        Guid? clinicId,
        IEnumerable<YakapMasterlistSyncItem> assignments,
        CancellationToken ct = default);

    /// <summary>
    /// Parses an XML payload adhering to KonsultaMasterlist_v1.4.dtd and synchronizes matched patients.
    /// </summary>
    Task<YakapMasterlistSyncResult> SyncXmlAsync(
        string tenantId,
        Guid? clinicId,
        string xmlContent,
        string? fallbackEffectiveYear = null,
        CancellationToken ct = default);

    /// <summary>
    /// Synchronizes beneficiaries from a YakapMasterlistProxyResponse (using RawXml or Beneficiaries DTO).
    /// </summary>
    Task<YakapMasterlistSyncResult> SyncProxyResponseAsync(
        string tenantId,
        Guid? clinicId,
        YakapMasterlistProxyResponse proxyResponse,
        CancellationToken ct = default);

    /// <summary>
    /// Synchronizes beneficiaries directly, scoping to ambient context if set or all scoped patients.
    /// Returns the total number of matched and updated patients.
    /// </summary>
    Task<int> SyncMasterlistBeneficiariesAsync(
        IEnumerable<YakapBeneficiaryDto> beneficiaries,
        CancellationToken ct = default);
}
