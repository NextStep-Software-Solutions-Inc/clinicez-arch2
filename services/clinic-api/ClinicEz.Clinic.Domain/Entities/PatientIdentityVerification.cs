using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientIdentityVerification : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public DateOnly VerificationDate { get; set; }
    public YakapVerificationMode Mode { get; set; } = YakapVerificationMode.VALID_ID;

    // Service 01 PCU Liveness
    public string? PcuTransactionId { get; set; }
    public int? PcuStatusCode { get; set; }
    public string? PcuAuthorizationId { get; set; }
    public string? PcuLaunchUrl { get; set; }
    public string? PcuResultCode { get; set; }
    public bool? PcuPinMatched { get; set; }

    // Service 07 OTP
    public string? OneTimePin { get; set; }
    public string? OtpValidationStatus { get; set; }

    // Government Valid ID (< 1 MB JPEG)
    public string? ValidIdTypeCode { get; set; }
    public string? ValidIdNumber { get; set; }
    public Guid? ValidIdAttachmentId { get; set; }
    public RecordAttachment? ValidIdAttachment { get; set; }
    public bool ValidIdTransmittedOnDate { get; set; } = false;
    public DateOnly? VerifiedManilaDate { get; set; }
    public bool FirstUploadedOnDate { get; set; } = false;

    public DateTime? VerifiedAtUtc { get; set; }
    public Guid? VerifiedByStaffId { get; set; }
    public string? VerifiedByStaffName { get; set; }
}
