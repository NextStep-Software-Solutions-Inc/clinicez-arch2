using ClinicEz.Pharmacy.Api.Middleware;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Middlewares;

namespace ClinicEz.Pharmacy.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddApiServices(this IServiceCollection services)
    {
        services.AddControllers();
        services.AddOpenApi();

        // Pharmacy-specific failures (payment gate, hub claims) first, so they keep their stable error codes
        services.AddExceptionHandler<PharmacyExceptionHandler>();

        // 3. Add our custom global exception handler
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();

        // Expired subscriptions: read-only inside the grace window, blocked after it. Sign-in and license
        // installation stay reachable so a renewed license can always be applied.
        services.AddReadOnlyGrace<PharmacyLicenseState>(
            "/api/v1/auth", "/api/v1/license", "/api/v1/pharmacy/license", "/health", "/hangfire");
        return services;
    }
}




