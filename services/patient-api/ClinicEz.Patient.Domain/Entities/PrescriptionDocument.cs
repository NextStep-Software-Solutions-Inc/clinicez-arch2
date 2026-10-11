using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>Header of a prescription the patient received; its medication lines are <see cref="Prescription"/> rows.</summary>
public sealed class PrescriptionDocument : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    /// <summary>Id of the prescription across services; the idempotency key for upserts.</summary>
    public Guid PrescriptionId { get; set; }
    public string PrescriptionNumber { get; set; } = string.Empty;

    public string OrderingTenantId { get; set; } = string.Empty;
    public string OrderingFacilityId { get; set; } = string.Empty;
    public string OrderingFacilityName { get; set; } = string.Empty;
    public string PrescriberName { get; set; } = string.Empty;
    public string PrescriberPrcLicense { get; set; } = string.Empty;
    public string? Diagnosis { get; set; }
    public string? Instructions { get; set; }

    public PrescriptionStage Stage { get; set; } = PrescriptionStage.Issued;
    public DateTime? StageChangedAt { get; set; }
    public decimal? QuotedAmount { get; set; }
    public string? PharmacyName { get; set; }

    /// <summary>QR content the patient shows at any ClinicEZ pharmacy to have the prescription filled.</summary>
    public string? ClaimToken { get; set; }
    public string? VerificationUrl { get; set; }

    public string? ReceiptNumber { get; set; }
    public DateTime? DispensedAt { get; set; }
    /// <summary>Set when the patient reported filling the prescription at a pharmacy outside ClinicEZ.</summary>
    public string? ExternalPharmacyName { get; set; }
    public DateTime IssuedAt { get; set; }

    /// <summary>False while the row only exists because a status update arrived before the prescription itself.</summary>
    public bool HasDetails { get; set; }

    public ICollection<Prescription> Lines { get; set; } = [];
}