namespace PatientAppBE.Application.Common.Interfaces;

public interface IPushNotificationService
{
    Task SendPushNotificationAsync(string token, string title, string body, string action, CancellationToken cancellationToken = default);
}
