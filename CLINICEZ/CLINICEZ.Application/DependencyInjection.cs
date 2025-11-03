using Microsoft.Extensions.DependencyInjection;
using Sieve.Services;
using System.Reflection;

namespace CLINICEZ.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<ISieveProcessor, SieveProcessor>();
        services.AddMediatR(config =>
            config.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly()));

        return services;
    }
}