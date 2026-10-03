using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class YakapTransmittal : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    /// <summary>
    /// PhilHealth transmittal number, e.g. "RHCI09214202600001" or generated reference.
    /// </summary>
    public required string TransmittalNumber { get; set; }

    /// <summary>
    /// "1" for Tranche 1 (First Tranche: Enlistment + Profiling + placeholder SOAP/MED),
    /// "2" for Tranche 2 (Second Tranche: Consultations, SOAP, Diagnostics, GAMOT Medicines).
    /// </summary>
    public required string ReportTagging { get; set; } = "1";

    /// <summary>
    /// PhilHealth benefit year, e.g. "2026".
    /// </summary>
    public required string EffectiveYear { get; set; }

    /// <summary>
    /// Package type: "K" for Konsulta / Yakap.
    /// </summary>
    public string PackageType { get; set; } = "K";

    public YakapTransmittalStatus Status { get; set; } = YakapTransmittalStatus.Draft;

    /// <summary>
    /// PhilHealth transaction sequence or reference number received upon submission.
    /// </summary>
    public string? PhilHealthTransactionNumber { get; set; }

    /// <summary>
    /// Raw XML generated before encryption.
    /// </summary>
    public string? RawXmlPayload { get; set; }

    /// <summary>
    /// Hash of encrypted document per Annex D or transmission ticket.
    /// </summary>
    public string? EncryptedPayloadHash { get; set; }

    /// <summary>
    /// Validation or transmission deficiency remarks / error list.
    /// </summary>
    public List<string> ValidationErrors { get; set; } = new();

    public DateTime? SubmittedAt { get; set; }
    public string? SubmittedBy { get; set; }

    public ICollection<YakapTransmittalItem> Items { get; set; } = new List<YakapTransmittalItem>();
}
