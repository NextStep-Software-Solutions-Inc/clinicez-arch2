using System;

namespace ClinicEz.Shared.Common;

public record AppointmentBookedEvent
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid DraftId { get; init; }
    public Guid PatientId { get; init; }
    public Guid ClinicId { get; init; }
    public string? TenantId { get; init; }
    public DateOnly? PreferredDate { get; init; }
    public string? PreferredTime { get; init; }
    public string? Reason { get; init; }
    public string? Notes { get; init; }
    public string ShareFieldsJson { get; init; } = "[]";
    public string AttachedFileIdsJson { get; init; } = "[]";
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    // Patient Profile & Consented Demographics
    public string? PatientFirstName { get; init; }
    public string? PatientMiddleName { get; init; }
    public string? PatientLastName { get; init; }
    public string? PatientSuffix { get; init; }
    public DateOnly? DateOfBirth { get; init; }
    public string? Gender { get; init; }
    public string? ContactNumber { get; init; }
    public string? Email { get; init; }

    // PhilHealth & Dependent Sponsor Details
    public string? PhilHealthNumber { get; init; }
    public string? PhilHealthCategory { get; init; }
    public string? SponsorPin { get; init; }
    public string? SponsorLastName { get; init; }
    public string? SponsorFirstName { get; init; }
    public string? SponsorMiddleName { get; init; }
    public string? SponsorSuffix { get; init; }
    public DateOnly? SponsorDob { get; init; }
    public string? SponsorRelationship { get; init; }

    // Patient Attached Files (External Documents)
    public List<BookedAttachmentItem> AttachedFiles { get; init; } = [];
}

public record BookedAttachmentItem
{
    public Guid FileId { get; init; }
    public string FileName { get; init; } = string.Empty;
    public string? DocumentTypeCode { get; init; }
    public string? MimeType { get; init; }
    public long SizeBytes { get; init; }
}

