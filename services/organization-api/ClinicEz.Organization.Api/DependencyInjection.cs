using ClinicEz.Shared.Common;
using ClinicEz.Shared.Middlewares;

namespace ClinicEz.Organization.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddApiServices(this IServiceCollection services)
    {
        services.AddControllers();
        services.AddStrictStringEnums();
        services.AddOpenApi();

        // 3. Add our custom global exception handler
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();
        return services;
    }
}




