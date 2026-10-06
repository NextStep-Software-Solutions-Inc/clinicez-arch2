using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Shared.Middlewares;

public static class CorsExtensions
{
    public const string DevelopmentPolicyName = "Development";
    public const string ProductionPolicyName = "Production";

    /// <summary>
    /// Registers unified CORS policies for ClinicEz microservices.
    /// In Development environments (or when Cors:AllowAnyOrigin is true), all origins are permitted with credentials.
    /// In Production, trusted wildcards (*.clinicez.net, *.nextstep-software.com, *.vercel.app, localhost) and
    /// any origins defined in Cors:AllowedOrigins are permitted.
    /// </summary>
    public static IServiceCollection AddClinicEzCors(
        this IServiceCollection services,
        IConfiguration configuration,
        IWebHostEnvironment environment)
    {
        var isDevelopment = environment.IsDevelopment() ||
                            environment.EnvironmentName.Contains("Dev", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(configuration["Environment"], "Development", StringComparison.OrdinalIgnoreCase) ||
                            configuration.GetValue<bool>("Cors:AllowAnyOrigin") ||
                            string.Equals(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Development", StringComparison.OrdinalIgnoreCase) ||
                            Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")?.Contains("Dev", StringComparison.OrdinalIgnoreCase) == true;

        services.AddCors(options =>
        {
            // Development Policy: allow any origin with credentials
            options.AddPolicy(DevelopmentPolicyName, policy =>
            {
                policy
                    .SetIsOriginAllowed(_ => true)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });

            // Production Policy: restrict to trusted company domains and explicitly configured origins
            options.AddPolicy(ProductionPolicyName, policy =>
            {
                var extraOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

                policy
                    .SetIsOriginAllowed(origin =>
                    {
                        if (string.IsNullOrWhiteSpace(origin)) return false;
                        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;

                        var host = uri.Host;

                        if (IsHostAllowed(host, configuration))
                        {
                            return true;
                        }

                        return IsOriginMatched(extraOrigins, origin);
                    })
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });

            // Default policy delegates according to active environment
            options.AddDefaultPolicy(policy =>
            {
                if (isDevelopment)
                {
                    policy
                        .SetIsOriginAllowed(_ => true)
                        .AllowAnyHeader()
                        .AllowAnyMethod()
                        .AllowCredentials();
                }
                else
                {
                    var extraOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

                    policy
                        .SetIsOriginAllowed(origin =>
                        {
                            if (string.IsNullOrWhiteSpace(origin)) return false;
                            if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;

                            var host = uri.Host;

                            if (IsHostAllowed(host, configuration))
                            {
                                return true;
                            }

                            return IsOriginMatched(extraOrigins, origin);
                        })
                        .AllowAnyHeader()
                        .AllowAnyMethod()
                        .AllowCredentials();
                }
            });
        });

        return services;
    }

    private static bool IsHostAllowed(string host, IConfiguration configuration)
    {
        var baseDomain = configuration["Console:BaseDomain"] ?? configuration["CONSOLE_BASE_DOMAIN"];
        if (!string.IsNullOrWhiteSpace(baseDomain))
        {
            var cleanBase = baseDomain.Trim().TrimStart('.');
            if (host.Equals(cleanBase, StringComparison.OrdinalIgnoreCase) ||
                host.EndsWith("." + cleanBase, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        var allowedDomains = configuration.GetSection("Cors:AllowedDomains").Get<string[]>() ?? [];
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

        if (host.EndsWith(".vercel.app", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
            host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) ||
            host.EndsWith(".lvh.me", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }

    private static bool IsOriginMatched(string[] extraOrigins, string origin)
    {
        if (extraOrigins.Length == 0 || string.IsNullOrWhiteSpace(origin))
            return false;

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
    }
}
