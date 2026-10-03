using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.Yakap.DTOs;

public sealed record YakapTransmittalItemDto(
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

public sealed record YakapTransmittalDto(
    Guid Id,
    string TransmittalNumber,
    string ReportTagging,
    string EffectiveYear,
    string PackageType,
    YakapTransmittalStatus Status,
    string? PhilHealthTransactionNumber,
    string? EncryptedPayloadHash,
    IReadOnlyList<string> ValidationErrors,
    DateTime? SubmittedAt,
    string? SubmittedBy,
    DateTime CreatedAt,
    int TotalItemsCount,
    IReadOnlyList<YakapTransmittalItemDto> Items);

public sealed record YakapValidationResultDto(
    Guid TransmittalId,
    bool IsValid,
    string? TransmittalNumber,
    string? RawXml,
    IReadOnlyList<string> ValidationErrors);

public sealed record YakapSubmissionResultDto(
    Guid TransmittalId,
    bool IsSuccess,
    string TransmittalNumber,
    string? TransactionNumber,
    IReadOnlyList<string> ValidationErrors);
