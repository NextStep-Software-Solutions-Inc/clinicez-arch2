using Microsoft.Extensions.DependencyInjection;
using Sieve.Services;
using System.Reflection;

namespace CLINICEZ.TenantManagement.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<ISieveProcessor, SieveProcessor>();
        services.AddMediatR(config =>
            config.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly()));

        services.AddCors(options =>
        {
            options.AddPolicy("development", policy =>
            {
                policy
                    .AllowAnyOrigin()
                    .AllowAnyHeader()
                    .AllowAnyMethod();
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