using ClinicEz.Shared.Common;
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
                var extraOrigins = configuration?.GetStringList("Cors:AllowedOrigins") ?? [];

                policy
                    .SetIsOriginAllowed(origin =>
                    {
                        if (string.IsNullOrWhiteSpace(origin)) return false;
                        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;

                        var host = uri.Host;

                        // Allow configured base domain and its subdomains
                        var baseDomain = configuration?["Facility:BaseDomain"];

                        if (!string.IsNullOrWhiteSpace(baseDomain))
                        {
                            var cleanBaseDomain = baseDomain.Trim().TrimStart('.');
                            if (host.Equals(cleanBaseDomain, StringComparison.OrdinalIgnoreCase) ||
                                host.EndsWith("." + cleanBaseDomain, StringComparison.OrdinalIgnoreCase))
                            {
                                return true;
                            }
                        }

                        // Allow explicitly configured allowed domains and their subdomains
                        var allowedDomains = configuration?.GetStringList("Cors:AllowedDomains") ?? [];
                        foreach (var domain in allowedDomains)
                        {
                            if (string.IsNullOrWhiteSpace(domain)) continue;
                            var cleanDomain = domain.Trim().TrimStart('.');
                            if (host.Equals(cleanDomain, StringComparison.OrdinalIgnoreCase) ||
                                host.EndsWith("." + cleanDomain, StringComparison.OrdinalIgnoreCase))
                            {
                                return true;
                            }
                        }

                        // Allow Vercel preview environments
                        if (host.EndsWith(".vercel.app", StringComparison.OrdinalIgnoreCase))
                        {
                            return true;
                        }

                        // Allow localhost and local virtual hosts
                        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                            host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) ||
                            host.EndsWith(".lvh.me", StringComparison.OrdinalIgnoreCase))
                        {
                            return true;
                        }

                        // Allow any explicitly configured origins (with wildcard support)
                        return extraOrigins.Any(o =>
                        {
                            if (string.Equals(o, origin, StringComparison.OrdinalIgnoreCase))
                                return true;

                            if (o.Contains('*'))
                            {
                                var pattern = "^" + System.Text.RegularExpressions.Regex.Escape(o).Replace("\\*", ".*") + "$";
                                return System.Text.RegularExpressions.Regex.IsMatch(origin, pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                            }

                            return false;
                        });
                    })
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });
        });
        return services;
    }
}