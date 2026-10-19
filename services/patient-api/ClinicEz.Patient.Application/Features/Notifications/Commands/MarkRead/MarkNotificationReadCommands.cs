using MediatR;

namespace ClinicEz.Patient.Application.Features.Notifications.Commands.MarkRead;

public sealed record MarkNotificationReadCommand(Guid PatientId, Guid NotificationId) : IRequest;

public sealed record MarkAllNotificationsReadCommand(Guid PatientId) : IRequest;
