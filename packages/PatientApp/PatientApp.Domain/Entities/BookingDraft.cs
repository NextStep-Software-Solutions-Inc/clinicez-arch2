using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

public sealed class BookingDraft : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid ClinicId { get; set; }
    public Clinic Clinic { get; set; } = null!;
    public Guid? OrganizationId { get; set; }
    public Organization? Organization { get; set; }

    public DateOnly? PreferredDate { get; set; }
    public string? PreferredTime { get; set; }
    public string? Reason { get; set; }
    public string? Notes { get; set; }
    /// <summary>JSON array of ShareableFieldKey values the patient consents to share.</summary>
    public string ShareFieldsJson { get; set; } = "[]";
    public string AttachedFileIdsJson { get; set; } = "[]";
    public BookingDraftStatus Status { get; set; } = BookingDraftStatus.Draft;
}
