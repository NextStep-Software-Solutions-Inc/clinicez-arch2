using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ClinicSettings : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    /// <summary>
    /// Workspace/facility slugs announced by the control plane when the facility is provisioned. They make the
    /// workspace-by-slug lookup a purely local read (no portal database or HTTP dependency).
    /// </summary>
    public string? TenantSlug { get; set; }
    public string? FacilitySlug { get; set; }

    public required string ClinicName { get; set; }
    public string? TaxIdentificationNumber { get; set; } // TIN
    public string? AccreditationNumber { get; set; }     // e.g. PHIC-KONSULTA-09214
    public string? PmccNumber { get; set; }
    public string? SoftwareCertificateId { get; set; }
    public string? KonsultaEndpoint { get; set; } = "/soap/konsulta";
    public bool IsPhilHealthConfigured { get; set; }

    // Branch Inheritance & Clinic Override (Issue #70)
    public bool IsPhilHealthOverridden { get; set; } = false;

    // Stored Central Branch Baseline (Synchronized via Interop)
    public Guid? BranchId { get; set; }
    public string? BranchName { get; set; }
    public string? BranchPhilHealthAccreditationNumber { get; set; }
    public string? BranchPmccNumber { get; set; }
    public string? BranchSoftwareCertificateId { get; set; }
    public string? BranchKonsultaEndpoint { get; set; }
    public bool IsBranchPhilHealthAccredited { get; set; } = false;

    // Cryptographic License & Hard Limit Profile
    public string? LicenseToken { get; set; }
    public string PlanTier { get; set; } = "Community";
    public int MaxStaffLimit { get; set; } = 5;
    public DateTime? LicenseExpiresAt { get; set; }
    /// <summary>Version of the entitlements the held license was minted for; an older <c>entitlements.changed</c> never replaces a newer one.</summary>
    public int EntitlementVersion { get; set; }

    /// <summary>
    /// JSON encoded schedule, e.g. "Mon-Fri 8:00 AM - 5:00 PM, Sat 8:00 AM - 12:00 PM"
    /// </summary>
    public string OperatingHours { get; set; } = string.Empty;

    public int DefaultSlotDurationMinutes { get; set; } = 30;

    public string QueuePrefix { get; set; } = "Q";
    public string InvoicePrefix { get; set; } = "INV";

    public decimal DefaultConsultationFee { get; set; } = 400.00m;
    public decimal VatRate { get; set; } = 0.12m;
    public decimal DefaultDoctorSharePercentage { get; set; } = 0.70m;

    /// <summary>
    /// Cashier station operational mode:
    /// - "ClinicDesk": Invoices and payments are collected directly at the clinic desk (standalone).
    /// - "CashierCounter": Invoices are dispatched to the central cashier counter (billing-api / cashier-app).
    /// </summary>
    public string CashierMode { get; set; } = "ClinicDesk";

    // Letterhead and prescription formatting
    public string? LetterheadHeader { get; set; }
    public string? LetterheadSubHeader { get; set; }
    public string? LetterheadAddress { get; set; }
    public string? LetterheadContact { get; set; }
    public string? LetterheadDohLto { get; set; }
    public string? LetterheadFooter { get; set; }
    /// <summary>
    /// Document / Letterhead Accent Color used for clinical printouts, divider bars, and document headers.
    /// Completely independent of workstation UI color branding (<see cref="PrimaryColorHex"/>).
    /// If null or empty, falls back to <see cref="PrimaryColorHex"/>.
    /// </summary>
    public string? LetterheadAccentColorHex { get; set; }
    public string PrimaryColorHex { get; set; } = "#0284C7";
    public string? PrimaryLogoUrl { get; set; }
    public string PaperSize { get; set; } = "Letter";
    public string PreferredChartLayout { get; set; } = "modal";

    // Secured Clinic Join Link Settings
    public bool IsJoinEnabled { get; set; } = true;
    public string? JoinCode { get; set; }
    public DateTime? JoinCodeExpiresAt { get; set; }

    /// <summary>
    /// Tier 1 publishing governance: whether this clinic facility has been granted patient app directory discovery
    /// eligibility by the workspace administrator in Portal. Controlled strictly via control-plane interop events
    /// (<c>facility.directory.updated</c> or <c>facility.license.issued</c>). Clinic staff cannot mutate this flag.
    /// </summary>
    public bool IsWorkspaceEligible { get; set; } = false;

    /// <summary>
    /// Tier 2 publishing governance: whether this clinic has published its profile to the patient app directory.
    /// Can only be set to true if pre-flight readiness checks pass.
    /// </summary>
    public bool IsDirectoryPublished { get; set; } = false;

    /// <summary>
    /// Dynamic capacity control: pauses online appointment booking on the patient app while leaving
    /// the clinic profile discoverable.
    /// </summary>
    public bool IsOnlineBookingPaused { get; set; } = false;

    // Configurable Patient Search Result Display Fields
    public string? PatientSearchDisplayFieldsJson { get; set; }

    /// <summary>
    /// 24-hour time format "HH:mm" (e.g. "21:00") when automated EOD reconciliation executes.
    /// </summary>
    public string EodReconciliationTime { get; set; } = "21:00";

    /// <summary>
    /// Controls whether the automated background worker reconciles remaining tickets.
    /// </summary>
    public bool AutoEodEnabled { get; set; } = true;

    /// <summary>
    /// Controls whether patient names are privacy-masked (e.g. "Cassandra A.") on public waiting area TV displays.
    /// </summary>
    public bool TvDisplayMaskPatientNames { get; set; } = true;

    /// <summary>
    /// Controls whether mobile patient app push notifications are dispatched for queue events.
    /// </summary>
    public bool EnableQueuePushNotifications { get; set; } = true;

    /// <summary>
    /// The number of patients ahead in line (1 to 5) that triggers an approaching turn notification to the patient app.
    /// </summary>
    public int QueuePushNotificationThreshold { get; set; } = 2;

    /// <summary>
    /// Controls whether clinicians can call specific patients directly from individual queue chips.
    /// Opt-in setting; defaults to false to enforce sequential queue calling unless explicitly enabled.
    /// </summary>
    public bool EnableChipLevelQueueCalling { get; set; } = false;

    /// <summary>
    /// Retention period (in days) for read staff notifications before automated purge. 0 = keep indefinitely.
    /// Default is 30 days.
    /// </summary>
    public int StaffNotificationRetentionDays { get; set; } = 30;

    /// <summary>
    /// Controls whether STAT/panic diagnostic findings trigger an audible alert chime in the clinic app.
    /// </summary>
    public bool EnableStatAudioAlert { get; set; } = true;

    /// <summary>
    /// Controls whether STAT/panic diagnostic findings trigger device vibration (mobile/tablet).
    /// </summary>
    public bool EnableStatVibrationAlert { get; set; } = true;

    /// <summary>
    /// Specialty operational mode: "Medical", "Dental", or "MultiSpecialty".
    /// Defaults to "Medical".
    /// </summary>
    public string? SpecialtyMode { get; set; } = "Medical";

    /// <summary>
    /// Feature flag controlling whether dental odontogram chart tabs, tooth records, and dental search are active.
    /// Defaults to false.
    /// </summary>
    public bool EnableDentalModule { get; set; } = false;

    /// <summary>
    /// Default signatory / approver name for operational and statutory reports (e.g. "Dr. Roberto Santos, MD").
    /// If null or empty, defaults to "Authorized Signatory".
    /// </summary>
    public string? DefaultApproverName { get; set; }

    /// <summary>
    /// Default signatory / approver role or title for reports (e.g. "Medical Director", "Clinic Administrator").
    /// If null or empty, defaults to the specific report standard title.
    /// </summary>
    public string? DefaultApproverTitle { get; set; }

    /// <summary>
    /// Optional JSON-serialized dictionary of per-document/report signatory configuration.
    /// Key: document identifier (e.g. "DailyEod", "Morbidity", "TaxDiscounts", "DoctorShares", "Analytics").
    /// Value: <see cref="DocumentSignatoryConfig"/> JSON.
    /// </summary>
    public string? DocumentSignatoriesJson { get; set; }

    public bool EnableAppointmentReminders { get; set; } = true;
    public bool AppointmentReminder24hEnabled { get; set; } = true;
    public bool AppointmentReminder2hEnabled { get; set; } = true;
    public bool EnableStaffAppointmentNotifications { get; set; } = true;

    /// <summary>
    /// Optional clinic-level IANA timezone override (e.g. "Asia/Manila", "Asia/Singapore", "America/New_York").
    /// When null or empty, inherits from <c>WorkspaceProfile.TimeZoneId</c> (defaulting to "Asia/Manila").
    /// </summary>
    public string? TimeZoneId { get; set; }

    /// <summary>
    /// Optional clinic-level date format override (e.g. "MMM d, yyyy", "d MMM yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd").
    /// When null or empty, inherits from <c>WorkspaceProfile.DateFormat</c> (defaulting to "MMM d, yyyy").
    /// </summary>
    public string? DateFormat { get; set; }

    /// <summary>
    /// Optional clinic-level time format override ("12h" or "24h").
    /// When null or empty, defaults to "12h" (12-hour AM/PM clock).
    /// </summary>
    public string? TimeFormat { get; set; }

    // ── Teleconsultation Recording & Payment Policies (Milestone M4) ─────────
    /// <summary>
    /// Clinic teleconsultation recording policy: "Disabled" (default), "WorkspaceVaultOnly", "LocalDeviceOnly", "Both".
    /// </summary>
    public string TeleconsultRecordingPolicy { get; set; } = "Disabled";

    /// <summary>
    /// Retention period in days for teleconsultation recordings: 30, 90, 365, or 0 (indefinite).
    /// Default is 90 days.
    /// </summary>
    public int TeleconsultRecordingRetentionDays { get; set; } = 90;

    /// <summary>
    /// Enforces mandatory live dual consent before recording can begin. Default is true (RA 10173 & RA 4200 compliance).
    /// </summary>
    public bool TeleconsultRecordingConsentRequired { get; set; } = true;

    /// <summary>
    /// Default payment policy for teleconsultations: "Prepaid" (default), "Postpaid", "Exempt".
    /// </summary>
    public string TeleconsultPaymentPolicy { get; set; } = "Prepaid";

    /// <summary>
    /// Default consultation fee for teleconsultations. Defaults to 400.00m (PHP).
    /// </summary>
    public decimal TeleconsultDefaultFee { get; set; } = 400.00m;

    /// <summary>
    /// Automatically exempts registered PhilHealth Konsulta (YAKAP) beneficiaries from teleconsult prepayment.
    /// Default is true.
    /// </summary>
    public bool TeleconsultAutoExemptYakap { get; set; } = true;

}

/// <summary>
/// Configurable signatory and titles for a specific report or clinical document.
/// </summary>
public sealed record DocumentSignatoryConfig(
    string? PreparedByTitle = null,
    string? ApproverName = null,
    string? ApproverTitle = null
);
