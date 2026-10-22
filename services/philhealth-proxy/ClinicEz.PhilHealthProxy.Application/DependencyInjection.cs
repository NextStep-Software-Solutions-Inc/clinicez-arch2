using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using ClinicEz.PhilHealthProxy.Application.Behaviors;
using System.Reflection;

namespace ClinicEz.PhilHealthProxy.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddMediatR(config =>
            { config.LicenseKey = ClinicEz.Shared.Common.MediatRLicense.Resolve(); config.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly()); });

        services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());

        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

        return services;
    }
}
