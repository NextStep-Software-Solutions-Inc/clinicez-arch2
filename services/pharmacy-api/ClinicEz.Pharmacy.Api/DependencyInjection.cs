using ClinicEz.Pharmacy.Api.Middleware;
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
        return services;
    }
}




