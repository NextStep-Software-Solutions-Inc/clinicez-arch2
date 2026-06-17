using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

public sealed class NotificationPreferences : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public NotificationCategory Category { get; set; }
    public bool PushEnabled { get; set; } = true;
    public bool InAppEnabled { get; set; } = true;
}
