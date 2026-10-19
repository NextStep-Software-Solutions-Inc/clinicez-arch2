using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Domain.Entities;

public enum ShareImportStatus { Pending, Imported, Denied, Failed }

/// <summary>
/// One staff-initiated request to import a patient's shared record (scan-to-fetch). Its id is the interop correlation id
/// of the <c>patient.share.redeem</c> request, so the patient plane's <c>patient.share.snapshot</c> reply finds it.
/// </summary>
public sealed class ShareImport : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public Guid? RequestedByStaffId { get; set; }
    public string Purpose { get; set; } = "Consultation";

    public bool AddToQueue { get; set; }
    public string? ChiefComplaint { get; set; }

    public ShareImportStatus Status { get; set; } = ShareImportStatus.Pending;
    public string? DenialReason { get; set; }
    public ShareDenialCode? DenialCode { get; set; }

    public Guid? ClinicPatientId { get; set; }
    public string? PatientName { get; set; }
    public string? ClinicEzId { get; set; }
    public Guid? GrantId { get; set; }
    public SharingScopes Scopes { get; set; }
    public DateTime? GrantExpiresAt { get; set; }
    public int ItemsImported { get; set; }

    /// <summary>1-based count of this redemption of the token, and how many the patient allowed in all.</summary>
    public int? RedemptionNumber { get; set; }
    public int? MaxRedemptions { get; set; }

    /// <summary>True when this clinic already held a grant from the same token and the import refreshed the chart.</summary>
    public bool IsRefresh { get; set; }

    /// <summary>Granted-scope items that have no field on the clinic patient (medications, vitals, ...), kept as the imported snapshot.</summary>
    public string? ItemsJson { get; set; }

    public Guid? QueueItemId { get; set; }
    public string? QueueNumber { get; set; }

    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
}
