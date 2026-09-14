using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Sieve.Services;
using System.Reflection;
namespace ClinicEz.Portal.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<ISieveProcessor, SieveProcessor>();
        services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());
        services.AddMediatR(config =>
        {
            config.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly());
            config.AddBehavior(typeof(MediatR.IPipelineBehavior<,>), typeof(Common.Behaviors.ValidationBehavior<,>));
        });

        services.AddCors(options =>
        {
            options.AddPolicy("development", policy =>
            {
                policy
                    .SetIsOriginAllowed(origin => true)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });

            options.AddPolicy("production", policy =>
            {
                policy
                    .WithOrigins("https://clinicez-portal-pro.vercel.app")
                    .AllowAnyHeader()
                    .AllowAnyMethod();
            });
        });
        return services;
    }
}