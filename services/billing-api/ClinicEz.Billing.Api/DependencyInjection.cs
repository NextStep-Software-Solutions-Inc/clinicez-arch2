using ClinicEz.Shared.Common;
using ClinicEz.Shared.Middlewares;

namespace ClinicEz.Billing.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddApiServices(this IServiceCollection services)
    {
        services.AddControllers();
        services.AddStrictStringEnums();
        services.AddOpenApi();

        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();
        return services;
    }
}
