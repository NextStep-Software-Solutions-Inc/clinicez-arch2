using ClinicEz.Laboratory.Api.Middlewares;
using ClinicEz.Shared.Middlewares;

namespace ClinicEz.Laboratory.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddApiServices(this IServiceCollection services)
    {
        services.AddControllers();
        services.AddOpenApi();

        // 3. Add our custom exception handlers: laboratory-specific codes first, then the shared catch-all mapping
        services.AddExceptionHandler<LabExceptionHandler>();
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();
        return services;
    }
}




