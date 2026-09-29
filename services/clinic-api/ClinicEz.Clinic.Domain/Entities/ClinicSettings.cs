using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ClinicSettings : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public required string ClinicName { get; set; }
    public string? TaxIdentificationNumber { get; set; } // TIN
    public string? AccreditationNumber { get; set; }     // e.g. PHIC-KONSULTA-09214

    /// <summary>
    /// JSON encoded schedule, e.g. "Mon-Fri 8:00 AM - 5:00 PM, Sat 8:00 AM - 12:00 PM"
    /// </summary>
    public string OperatingHours { get; set; } = "Mon-Sat 8:00 AM - 5:00 PM";

    public int DefaultSlotDurationMinutes { get; set; } = 30;

    public string QueuePrefix { get; set; } = "Q";
    public string InvoicePrefix { get; set; } = "INV";

    public decimal DefaultConsultationFee { get; set; } = 400.00m;
    public decimal VatRate { get; set; } = 0.12m;

    // Letterhead and prescription formatting
    public string? LetterheadHeader { get; set; }
    public string? LetterheadSubHeader { get; set; }
    public string? LetterheadAddress { get; set; }
    public string? LetterheadContact { get; set; }
    public string? LetterheadFooter { get; set; }
}
