using System;
using System.ComponentModel.DataAnnotations.Schema;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Verified clinical document attestation projection for public verification and external e-Rx dispense.
/// Synchronized from clinic-api and laboratory-api via document.attestation.published.
/// Strictly ZERO PHI: contains only cryptographic verification hashes, prescriber/issuer metadata, and lifecycle status.
/// </summary>
public class DocumentAttestation : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public Guid FacilityId { get; set; }
    public Facility? Facility { get; set; }

    /// <summary>
    /// Document kind discriminator: "medical-certificate", "referral", "rx", "lab-order", "receipt", "lab-report".
    /// </summary>
    public string DocumentKind { get; set; } = string.Empty;

    /// <summary>
    /// Sequential human-readable document number (e.g. "MC-20261025-0001", "RX-20261025-0042", "ACC-20261025-0012").
    /// </summary>
    public string DocumentNumber { get; set; } = string.Empty;

    /// <summary>
    /// Upstream source document ID in clinic-api (ConsultationEncounter.Id, MedicalCertificate.Id, etc.) or laboratory-api.
    /// </summary>
    public Guid SourceDocumentId { get; set; }

    /// <summary>
    /// Hex-encoded SHA-256 hash of the public verification token for prescriptions ({clinicId:N}.{secret} or legacy rxv_...).
    /// Null for non-prescription documents.
    /// </summary>
    public string? VerificationTokenHash { get; set; }

    [NotMapped]
    public string? PublicVerificationTokenHash
    {
        get => VerificationTokenHash;
        set => VerificationTokenHash = value;
    }

    /// <summary>
    /// Full cryptographic document digest (e.g. "SEC-SHA256-4A5B6C7D8E9F1011").
    /// </summary>
    public string SecurityDigest { get; set; } = string.Empty;

    // Prescriber / Facility Attestation Metadata (Non-PHI)
    public string ClinicName { get; set; } = string.Empty;
    public string? ClinicAddress { get; set; }
    public string? ClinicContact { get; set; }
    public string? DoctorName { get; set; }
    public string? DoctorPrcLicense { get; set; }
    public string? DoctorPtr { get; set; }
    public string? DoctorS2License { get; set; }

    public DateTime IssuedAtUtc { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }

    /// <summary>
    /// Status: "VALID", "REVOKED", "DISPENSED", "EXPIRED".
    /// </summary>
    public string Status { get; set; } = "VALID";

    // Dispense Lifecycle & Audit Metadata (Zero PHI)
    public bool IsAlreadyDispensed { get; set; }
    public string? DispenseStatus { get; set; } // "Pending", "Dispensed", "DispensedExternally"
    public DateTime? DispensedAtUtc { get; set; }
    public string? DispensedPharmacyName { get; set; }
    public string? DispensedReceiptFileName { get; set; }
    public bool HasDangerousDrug { get; set; }
    public int ItemCount { get; set; }
}
