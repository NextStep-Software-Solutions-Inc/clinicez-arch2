using Clinic EZ.Shared.Middlewares;
using MainPortalBE.Api.Extensions;
namespace MainPortalBE.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddApiServices(this IServiceCollection services)
    {
        services.AddEndpoints(typeof(DependencyInjection).Assembly);
        services.AddEndpointsApiExplorer();

        services.AddOpenApi();

        // 3. Add our custom global exception handler
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();
        return services;
    }
}
