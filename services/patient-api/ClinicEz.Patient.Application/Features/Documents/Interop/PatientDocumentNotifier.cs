using System.Text.Json;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Documents.Interop;

/// <summary>Records what a facility sent as a notification the patient sees in the app and picks up with the next sync.</summary>
public sealed class PatientDocumentNotifier
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly INotificationRepository _notifications;

    public PatientDocumentNotifier(INotificationRepository notifications) => _notifications = notifications;

    public Task NotifyAsync(
        Guid patientId, NotificationType type, string title, string body, string kind, Guid documentId, CancellationToken cancellationToken) =>
        _notifications.AddAsync(new Notification
        {
            PatientId = patientId,
            Type = type,
            Category = NotificationCategory.Clinic,
            Title = title,
            Body = body,
            SourceId = documentId.ToString(),
            Payload = JsonSerializer.Serialize(new { kind, documentId }, Json)
        }, cancellationToken);
}
