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

                        // Allow clinicez.net and any subdomain (*.clinicez.net, *.dev.clinicez.net)
                        if (host.Equals("clinicez.net", StringComparison.OrdinalIgnoreCase) ||
                            host.EndsWith(".clinicez.net", StringComparison.OrdinalIgnoreCase))
                        {
                            return true;
                        }

                        // Allow nextstep-software.com and any subdomain (*.nextstep-software.com, *.dev.nextstep-software.com)
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

                        // Allow localhost and local virtual hosts
                        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                            host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) ||
                            host.EndsWith(".lvh.me", StringComparison.OrdinalIgnoreCase))
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

                            if (host.Equals("clinicez.net", StringComparison.OrdinalIgnoreCase) ||
                                host.EndsWith(".clinicez.net", StringComparison.OrdinalIgnoreCase) ||
                                host.Equals("nextstep-software.com", StringComparison.OrdinalIgnoreCase) ||
                                host.EndsWith(".nextstep-software.com", StringComparison.OrdinalIgnoreCase) ||
                                host.EndsWith(".vercel.app", StringComparison.OrdinalIgnoreCase) ||
                                host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                                host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) ||
                                host.EndsWith(".lvh.me", StringComparison.OrdinalIgnoreCase))
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
