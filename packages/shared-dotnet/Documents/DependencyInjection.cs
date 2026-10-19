using ClinicEz.Shared.Documents.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Shared.Documents;

public static class DocumentEngineServiceExtensions
{
    /// <summary>
    /// Registers the document engine. <paramref name="signingSecret"/> defaults to <c>Documents:SigningKey</c> / <c>DOCUMENT_SIGNING_KEY</c>
    /// (required outside Development; there is no built-in key).
    /// </summary>
    public static IServiceCollection AddClinicEzDocumentEngine(this IServiceCollection services, string? signingSecret = null)
    {
        QuestPdfInitializer.EnsureInitialized();
        services.AddSingleton<IDocumentSecurityService>(sp => new DocumentSecurityService(
            signingSecret
            ?? sp.GetService<IConfiguration>()?[DocumentSecurityService.SigningKeySetting]
            ?? Environment.GetEnvironmentVariable(DocumentSecurityService.SigningKeyEnvironmentVariable),
            sp.GetService<IHostEnvironment>()));
        services.AddSingleton<IQrCodeService, QrCodeService>();
        return services;
    }
}
