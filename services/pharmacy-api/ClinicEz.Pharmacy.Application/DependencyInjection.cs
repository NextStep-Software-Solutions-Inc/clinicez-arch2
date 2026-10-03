using ClinicEz.Pharmacy.Application.Behaviors;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Sieve.Services;
using System.Reflection;

namespace ClinicEz.Pharmacy.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<ISieveProcessor, SieveProcessor>();

        services.AddMediatR(config =>
            config.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly()));

        services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());

        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

        services.AddSingleton<ClinicEz.Pharmacy.Domain.Services.IUpscSecurityService, ClinicEz.Pharmacy.Domain.Services.UpscSecurityService>();
        services.AddSingleton<ClinicEz.Pharmacy.Domain.Services.IGamotFormularyService, ClinicEz.Pharmacy.Domain.Services.GamotFormularyService>();

        return services;
    }
}



