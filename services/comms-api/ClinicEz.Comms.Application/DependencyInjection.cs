using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Comms.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddCommsApplication(this IServiceCollection services)
    {
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(DependencyInjection).Assembly));
        return services;
    }
}
