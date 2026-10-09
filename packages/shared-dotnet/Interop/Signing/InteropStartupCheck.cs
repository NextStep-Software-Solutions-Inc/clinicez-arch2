using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Security;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Interop;

/// <summary>
/// Fails the host at startup (instead of at the first request or message) when its security keys are missing outside
/// Development: the license authority keys and the document signing key (when this service registers them) and the hub client
/// signing key. Registered by <c>AddInterop</c>, so every service has it.
/// </summary>
internal sealed class InteropStartupCheck(IServiceProvider services, IOptions<InteropOptions> options, IHostEnvironment? environment = null) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        // Resolving the singletons runs their constructors, which throw a descriptive error when a key is missing.
        using (var scope = services.CreateScope())
        {
            _ = scope.ServiceProvider.GetService<IFacilityLicenseSigner>();
            _ = scope.ServiceProvider.GetService<IFacilityLicenseValidator>();
            _ = scope.ServiceProvider.GetService<IDocumentSecurityService>();
        }

        var o = options.Value;
        if (!o.IsInProcess && !LicenseKeyMaterial.IsDevelopment(environment) && PemKey.Normalize(o.SigningKey, "Messaging:SigningKey") is null)
            throw new InvalidOperationException(
                "Messaging:SigningKey is required outside Development: set it to this service's hub client ECDSA P-256 private key " +
                "(PEM or base64 of PEM; the hub admin API returns it once when the client is created, or see scripts/generate-signing-key). " +
                "The hub rejects unsigned messages unless Hub:Signing:Required is false.");

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
