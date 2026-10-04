using ClinicEz.Shared.Documents.Security;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Shared.Documents;

public static class DocumentEngineServiceExtensions
{
    public static IServiceCollection AddClinicEzDocumentEngine(this IServiceCollection services, string? signingSecret = null)
    {
        QuestPdfInitializer.EnsureInitialized();
        services.AddSingleton<IDocumentSecurityService>(_ => new DocumentSecurityService(signingSecret));
        services.AddSingleton<IQrCodeService, QrCodeService>();
        return services;
    }
}
