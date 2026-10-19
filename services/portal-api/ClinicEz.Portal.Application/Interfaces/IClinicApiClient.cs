using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;

namespace ClinicEz.Portal.Application.Interfaces;

public record PortalEligibleYakapEncounterDto(
    Guid EncounterId,
    Guid PatientId,
    string PatientName,
    string? PhilHealthIdentificationNumber,
    DateTime EncounterDate,
    string DoctorName,
    string? PrimaryDiagnosis,
    int DiagnosesCount,
    int PrescriptionsCount,
    int DiagnosticsCount,
    bool IsYakapEligible,
    bool HasPhilHealthPin,
    decimal TotalMedicationAmount);

public record PortalYakapTransmittalItemDto(
    Guid Id,
    Guid YakapTransmittalId,
    Guid PatientId,
    string PatientName,
    string PhilHealthIdentificationNumber,
    Guid? ConsultationEncounterId,
    DateTime? EncounterDate,
    string ItemType,
    string ReportStatus,
    string? DeficiencyRemarks);

public record PortalYakapTransmittalDto(
    Guid Id,
    string TransmittalNumber,
    string ReportTagging,
    string EffectiveYear,
    string PackageType,
    string Status,
    string? PhilHealthTransactionNumber,
    string? EncryptedPayloadHash,
    IReadOnlyList<string> ValidationErrors,
    DateTime? SubmittedAt,
    string? SubmittedBy,
    DateTime CreatedAt,
    int TotalItemsCount,
    IReadOnlyList<PortalYakapTransmittalItemDto> Items,
    Guid? BranchId = null);

public record PortalCreateYakapTransmittalRequest(
    IReadOnlyList<Guid>? ConsultationEncounterIds,
    string ReportTagging,
    string? EffectiveYear,
    Guid? BranchId);

public record PortalYakapValidationResultDto(
    Guid TransmittalId,
    bool IsValid,
    string? TransmittalNumber,
    string? RawXml,
    IReadOnlyList<string> ValidationErrors);

public record PortalYakapSubmissionResultDto(
    Guid TransmittalId,
    bool IsSuccess,
    string TransmittalNumber,
    string? TransactionNumber,
    IReadOnlyList<string> ValidationErrors);

public interface IClinicApiClient
{
    Task<ApiResponse<List<PortalEligibleYakapEncounterDto>>> GetEligibleEncountersAsync(
        string tenantId,
        Guid branchId,
        string reportTagging,
        DateTime? startDate,
        DateTime? endDate,
        CancellationToken ct = default);

    Task<ApiResponse<IReadOnlyList<PortalYakapTransmittalDto>>> GetTransmittalsAsync(
        string tenantId,
        Guid branchId,
        string? status,
        string? reportTagging,
        CancellationToken ct = default);

    Task<ApiResponse<PortalYakapTransmittalDto>> GetTransmittalByIdAsync(
        string tenantId,
        Guid id,
        CancellationToken ct = default);

    Task<ApiResponse<string>> GetTransmittalRawXmlAsync(
        string tenantId,
        Guid id,
        CancellationToken ct = default);

    Task<ApiResponse<PortalYakapTransmittalDto>> CreateTransmittalAsync(
        string tenantId,
        Guid branchId,
        PortalCreateYakapTransmittalRequest request,
        CancellationToken ct = default);

    Task<ApiResponse<PortalYakapValidationResultDto>> ValidateTransmittalAsync(
        string tenantId,
        Guid id,
        CancellationToken ct = default);

    Task<ApiResponse<PortalYakapSubmissionResultDto>> SubmitTransmittalAsync(
        string tenantId,
        Guid branchId,
        Guid id,
        CancellationToken ct = default);
}
