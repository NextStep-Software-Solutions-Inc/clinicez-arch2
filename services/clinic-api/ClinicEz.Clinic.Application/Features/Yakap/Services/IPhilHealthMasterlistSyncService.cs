using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;

namespace ClinicEz.Clinic.Application.Features.Yakap.Services;

/// <summary>
/// Represents a normalized masterlist assignment item from PhilHealth PCAPI v2.0.
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
/// Service interface for synchronizing PhilHealth YAKAP 2.0 (Service 05) clinic roster assignments
/// into normalized relational <see cref="ClinicEz.Clinic.Domain.Entities.PatientYakapEnlistment"/> records.
/// </summary>
public interface IPhilHealthMasterlistSyncService
{
    string? NormalizePin(string? rawPin);

    Task<YakapMasterlistSyncResult> SyncAssignmentsAsync(
        string tenantId,
        Guid? clinicId,
        IEnumerable<YakapMasterlistSyncItem> assignments,
        CancellationToken ct = default);

    Task<YakapMasterlistSyncResult> SyncMasterlistDownloadAsync(
        string tenantId,
        Guid? clinicId,
        MasterlistDownloadResponse downloadResponse,
        CancellationToken ct = default);

    Task<int> SyncMasterlistBeneficiariesAsync(
        IEnumerable<YakapBeneficiaryDto> beneficiaries,
        CancellationToken ct = default);
}
