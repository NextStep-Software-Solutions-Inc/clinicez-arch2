using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using System.IO;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using PatientApp.Application.Common.Interfaces;

namespace PatientApp.Infrastructure.Services.Notifications;

public sealed class FirebasePushNotificationService : IPushNotificationService
{
    private readonly ILogger<FirebasePushNotificationService> _logger;
    private readonly bool _isConfigured;

    public FirebasePushNotificationService(IConfiguration configuration, ILogger<FirebasePushNotificationService> logger)
    {
        _logger = logger;

        var serviceAccountFilePath = configuration["Firebase:ServiceAccountFilePath"];
        var serviceAccountJson = configuration["Firebase:ServiceAccountJson"];
        try
        {
            if (FirebaseApp.DefaultInstance == null)
            {
                if (!string.IsNullOrWhiteSpace(serviceAccountFilePath) && File.Exists(serviceAccountFilePath))
                {
                    _logger.LogInformation("Firebase:ServiceAccountFilePath provided. Using file {FilePath}.", serviceAccountFilePath);
                    FirebaseApp.Create(new AppOptions
                    {
                        Credential = GoogleCredential.FromFile(serviceAccountFilePath)
                    });
                }
                else if (!string.IsNullOrWhiteSpace(serviceAccountJson))
                {
                    _logger.LogInformation("Firebase:ServiceAccountJson provided. Using raw JSON string.");
#pragma warning disable CS0618
                    FirebaseApp.Create(new AppOptions
                    {
                        Credential = GoogleCredential.FromJson(serviceAccountJson)
                    });
#pragma warning restore CS0618
                }
                else
                {
                    _logger.LogInformation("No Firebase credentials configured explicitly. Attempting to use Google Application Default Credentials (ADC).");
                    FirebaseApp.Create(new AppOptions
                    {
                        Credential = GoogleCredential.GetApplicationDefault()
                    });
                }
            }
            _isConfigured = true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize FirebaseApp. Push notifications will be disabled. Ensure you have provided a valid ServiceAccountJson or have configured Application Default Credentials.");
        }
    }

    public async Task SendPushNotificationAsync(string token, string title, string body, string action, CancellationToken cancellationToken = default)
    {
        if (!_isConfigured)
        {
            _logger.LogWarning("Cannot send push notification because Firebase is not configured.");
            return;
        }

        if (string.IsNullOrWhiteSpace(token))
        {
            return;
        }

        var message = new Message
        {
            Token = token,
            Notification = new Notification
            {
                Title = title,
                Body = body
            },
            Data = new Dictionary<string, string>
            {
                { "action", action }
            }
        };

        try
        {
            string response = await FirebaseMessaging.DefaultInstance.SendAsync(message, cancellationToken);
            _logger.LogInformation("Successfully sent push notification to token {Token}. MessageId: {MessageId}", token, response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending push notification to token {Token}", token);
        }
    }
}
