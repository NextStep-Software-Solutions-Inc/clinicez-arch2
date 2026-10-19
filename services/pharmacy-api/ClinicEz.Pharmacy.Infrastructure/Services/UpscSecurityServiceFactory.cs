using ClinicEz.Pharmacy.Domain.Services;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Pharmacy.Infrastructure.Services;

/// <summary>
/// Builds the UPSC signer from configuration. There is deliberately no built-in default: a missing or short
/// <c>Gamot:UpscSecretKey</c> stops the service at startup. Development supplies a clearly labelled dev key in
/// <c>appsettings.Development.json</c>; every other environment must provide its own (environment variable
/// <c>Gamot__UpscSecretKey</c>). Changing the key invalidates UPSC codes issued under the previous key.
/// </summary>
public static class UpscSecurityServiceFactory
{
    public const string ConfigurationKey = "Gamot:UpscSecretKey";

    public static UpscSecurityService Create(IConfiguration configuration)
    {
        var secret = configuration[ConfigurationKey];
        if (string.IsNullOrWhiteSpace(secret) || secret.Trim().Length < UpscSecurityService.MinSecretKeyLength)
        {
            throw new InvalidOperationException(
                $"{ConfigurationKey} (environment variable Gamot__UpscSecretKey) is required and must be at least " +
                $"{UpscSecurityService.MinSecretKeyLength} characters. There is no built-in default; generate a random secret and keep it stable.");
        }

        return new UpscSecurityService(secret);
    }
}
