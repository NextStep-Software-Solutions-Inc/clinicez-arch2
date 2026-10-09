using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

/// <summary>Staff-entered request to read a patient's shared record from a scanned (or pasted) share token.</summary>
public sealed record RedeemPatientShareRequest(
    string ShareToken,
    string? Purpose = null,
    bool AddToQueue = false,
    string? ChiefComplaint = null);

/// <summary>The redeem request is answered asynchronously; poll the status with this id.</summary>
public sealed record PatientShareRedeemAccepted(Guid CorrelationId);

public sealed record ShareImportStatusDto(
    Guid CorrelationId,
    string Status,
    string? DenialReason,
    Guid? PatientId,
    string? PatientName,
    string? ClinicEzId,
    IReadOnlyList<string> Scopes,
    DateTime? ExpiresAtUtc,
    int ItemsImported,
    Guid? QueueItemId,
    string? QueueNumber,
    DateTime RequestedAtUtc,
    DateTime? CompletedAtUtc)
{
    public static ShareImportStatusDto From(ShareImport import) => new(
        import.Id,
        import.Status.ToString(),
        import.DenialReason,
        import.ClinicPatientId,
        import.PatientName,
        import.ClinicEzId,
        ScopeNames(import.Scopes),
        import.GrantExpiresAt,
        import.ItemsImported,
        import.QueueItemId,
        import.QueueNumber,
        import.RequestedAt,
        import.CompletedAt);

    private static IReadOnlyList<string> ScopeNames(SharingScopes scopes) =>
        Enum.GetValues<SharingScopes>()
            .Where(s => s != SharingScopes.None && s != SharingScopes.All && scopes.HasFlag(s))
            .Select(s => s.ToString())
            .ToList();
}
