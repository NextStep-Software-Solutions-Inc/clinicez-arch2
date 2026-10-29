using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientYakapEnlistment : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public int EffectiveYear { get; set; }
    public YakapEnlistmentStatus Status { get; set; } = YakapEnlistmentStatus.Active;
    public YakapEnlistmentSource Source { get; set; } = YakapEnlistmentSource.ClinicEnlistment;
    public YakapPackageType PackageType { get; set; } = YakapPackageType.Konsulta;

    public DateOnly EnlistmentDate { get; set; }
    public DateOnly ValidUntil { get; set; }

    public string? CaseNo { get; set; }
    public string? EnlistmentTransNo { get; set; }
    public DateOnly? EnlistmentTransDate { get; set; }

    public string? ProfilingTransNo { get; set; }
    public DateOnly? ProfilingDate { get; set; }
    public string? ProfilingAtc { get; set; }

    public bool IsWalkedIn { get; set; }
    public bool HasPatientConsent { get; set; } = true;
    public DateTime? ConsentSignedAtUtc { get; set; }

    public string HciAccreditationNumber { get; set; } = string.Empty;
    public string? SelectionControlNumber { get; set; }
    public string? YesReferenceNo { get; set; }
    public string? RegistrationStatusCode { get; set; }
    public string? EmpanelmentMethod { get; set; }
    public bool IsPwd { get; set; } = false;
    public bool IsIndigenousPerson { get; set; } = false;
    public Guid? IdentityVerificationId { get; set; }
    public PatientIdentityVerification? IdentityVerification { get; set; }
    public TimeOnly? ProfilingTime { get; set; }
    public string? FpeClassificationType { get; set; }
    public string? ServiceDeliveryMethod { get; set; }
    public string? FacilitatorType { get; set; }
    public string? FacilitatorName { get; set; }
    public bool McaFlag { get; set; } = false;
    public bool HasCoPayment { get; set; } = false;
    public DateOnly? CoPaymentDate { get; set; }
    public decimal? CoPaymentAmount { get; set; }
    public decimal? CoPaymentBalance { get; set; }

    public DateTime? SuspendedAt { get; set; }
    public string? SuspensionReason { get; set; }
    public DateTime? TransferredAt { get; set; }
    public string? TransferredToPmcc { get; set; }
    public string? Remarks { get; set; }

    public Guid? CreatedByStaffId { get; set; }
    public string? CreatedByStaffName { get; set; }
}
