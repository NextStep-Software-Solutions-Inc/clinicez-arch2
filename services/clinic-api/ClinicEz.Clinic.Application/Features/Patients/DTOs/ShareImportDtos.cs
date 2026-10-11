using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Common;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

/// <summary>
/// Staff-entered request to read a patient's shared record from a scanned (or pasted) share token, or from the patient's
/// ClinicEZ ID and the one-time code they read out (leave the token empty then).
/// </summary>
public sealed record RedeemPatientShareRequest(
    string? ShareToken = null,
    string? Purpose = null,
    bool AddToQueue = false,
    string? ChiefComplaint = null,
    string? ClinicEzId = null,
    string? Code = null);

/// <summary>The redeem request is answered asynchronously; poll the status with this id.</summary>
public sealed record PatientShareRedeemAccepted(Guid CorrelationId);

public sealed record ShareImportStatusDto(
    Guid CorrelationId,
    string Status,
    string? DenialReason,
    string? DenialCode,
    Guid? PatientId,
    string? PatientName,
    string? ClinicEzId,
    IReadOnlyList<string> Scopes,
    DateTime? ExpiresAtUtc,
    int ItemsImported,
    int? RedemptionNumber,
    int? MaxRedemptions,
    bool IsRefresh,
    Guid? QueueItemId,
    string? QueueNumber,
    DateTime RequestedAtUtc,
    DateTime? CompletedAtUtc)
{
    public static ShareImportStatusDto From(ShareImport import) => new(
        import.Id,
        import.Status.ToString(),
        import.DenialReason,
        import.DenialCode?.ToString(),
        import.ClinicPatientId,
        import.PatientName,
        import.ClinicEzId,
        SharingScopeNames.Of(import.Scopes),
        import.GrantExpiresAt,
        import.ItemsImported,
        import.RedemptionNumber,
        import.MaxRedemptions,
        import.IsRefresh,
        import.QueueItemId,
        import.QueueNumber,
        import.RequestedAt,
        import.CompletedAt);
}
