using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sieve.Services;
using System.Reflection;
namespace ClinicEz.Portal.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services, IConfiguration? configuration = null)
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
                    .SetIsOriginAllowed(_ => true)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });

            options.AddPolicy("production", policy =>
            {
                var extraOrigins = configuration?.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

                policy
                    .SetIsOriginAllowed(origin =>
                    {
                        if (string.IsNullOrWhiteSpace(origin)) return false;
                        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;

                        var host = uri.Host;

                        // Allow clinicez.net and any subdomain (*.clinicez.net, e.g. v2.clinicez.net)
                        if (host.Equals("clinicez.net", StringComparison.OrdinalIgnoreCase) ||
                            host.EndsWith(".clinicez.net", StringComparison.OrdinalIgnoreCase))
                        {
                            return true;
                        }

                        // Allow nextstep-software.com and any subdomain (*.nextstep-software.com, e.g. dev.nextstep-software.com)
                        if (host.Equals("nextstep-software.com", StringComparison.OrdinalIgnoreCase) ||
                            host.EndsWith(".nextstep-software.com", StringComparison.OrdinalIgnoreCase))
                        {
                            return true;
                        }

                        // Allow Vercel preview environments
                        if (host.EndsWith(".vercel.app", StringComparison.OrdinalIgnoreCase))
                        {
                            return true;
                        }

                        // Allow any explicitly configured origins
                        return extraOrigins.Any(o => string.Equals(o, origin, StringComparison.OrdinalIgnoreCase));
                    })
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });
        });
        return services;
    }
}