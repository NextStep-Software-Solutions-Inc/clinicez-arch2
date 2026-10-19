using ClinicEz.Laboratory.Api.Middlewares;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Middlewares;

namespace ClinicEz.Laboratory.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddApiServices(this IServiceCollection services)
    {
        services.AddControllers();
        services.AddStrictStringEnums();
        services.AddOpenApi();

        // 3. Add our custom exception handlers: laboratory-specific codes first, then the shared catch-all mapping
        services.AddExceptionHandler<LabExceptionHandler>();
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();

        // Expired subscriptions: read-only inside the grace window, blocked after it. Sign-in and license
        // installation stay reachable so a renewed license can always be applied.
        services.AddReadOnlyGrace<LabLicenseState>(
            "/api/v1/auth", "/api/v1/license", "/api/v1/laboratory/license", "/health", "/hangfire");
        return services;
    }
}




