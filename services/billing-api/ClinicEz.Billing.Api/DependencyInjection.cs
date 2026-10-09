using ClinicEz.Shared.Common;
using ClinicEz.Shared.Licensing;
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

        services.AddReadOnlyGrace<ClinicEz.Billing.Api.Middlewares.BillingLicenseState>(
            "/api/v1/auth",
            "/health");
        return services;
    }
}
