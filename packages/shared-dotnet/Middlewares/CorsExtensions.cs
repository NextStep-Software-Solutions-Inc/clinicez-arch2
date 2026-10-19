using ClinicEz.Shared.Common;
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
    /// In the Development environment all origins are permitted with credentials.
    /// Anywhere else only the configured Facility:BaseDomain and Cors:AllowedDomains (each with its subdomains) and the origins
    /// (wildcard patterns allowed) in Cors:AllowedOrigins are permitted, and the host **fails to start** (see
    /// <see cref="CorsConfigurationGuard"/>) when none of them is configured or Cors:AllowAnyOrigin is true.
    /// </summary>
    public static IServiceCollection AddClinicEzCors(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        CorsConfigurationGuard.EnsureConfigured(configuration, environment);
        var isDevelopment = environment.IsDevelopment();

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
                var extraOrigins = configuration.GetStringList("Cors:AllowedOrigins");

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
                    var extraOrigins = configuration.GetStringList("Cors:AllowedOrigins");

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
        var baseDomain = configuration["Facility:BaseDomain"];
        if (!string.IsNullOrWhiteSpace(baseDomain))
        {
            var cleanBase = baseDomain.Trim().TrimStart('.');
            if (host.Equals(cleanBase, StringComparison.OrdinalIgnoreCase) ||
                host.EndsWith("." + cleanBase, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        var allowedDomains = configuration.GetStringList("Cors:AllowedDomains");
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

        // Nothing else is trusted outside Development: no preview-host, localhost or wildcard-suffix allowances.
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

/// <summary>
/// Start-up guard for cross-origin access, run by <see cref="CorsExtensions.AddClinicEzCors"/>. Outside Development a service
/// must be told which origins to trust (<c>Facility:BaseDomain</c>, <c>Cors:AllowedDomains</c> and/or <c>Cors:AllowedOrigins</c>);
/// there is no allow-everything fallback and <c>Cors:AllowAnyOrigin</c> is a Development-only switch.
/// Services that do not use <c>AddClinicEzCors</c> can call <see cref="EnsureConfigured"/> directly.
/// </summary>
public static class CorsConfigurationGuard
{
    public static void EnsureConfigured(IConfiguration configuration, IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);
        if (environment.IsDevelopment()) return;

        if (configuration.GetValue<bool>("Cors:AllowAnyOrigin"))
        {
            throw new InvalidOperationException(
                "Cors:AllowAnyOrigin is only allowed in Development. Configure Facility:BaseDomain (env Facility__BaseDomain), " +
                "Cors:AllowedDomains (env Cors__AllowedDomains) and/or Cors:AllowedOrigins (env Cors__AllowedOrigins) instead.");
        }

        var configured = !string.IsNullOrWhiteSpace(configuration["Facility:BaseDomain"])
                         || configuration.GetStringList("Cors:AllowedOrigins").Any(o => !string.IsNullOrWhiteSpace(o))
                         || configuration.GetStringList("Cors:AllowedDomains").Any(d => !string.IsNullOrWhiteSpace(d));
        if (!configured)
        {
            throw new InvalidOperationException(
                "CORS is not configured: set Facility:BaseDomain (env Facility__BaseDomain), Cors:AllowedDomains (env Cors__AllowedDomains) " +
                "or Cors:AllowedOrigins (env Cors__AllowedOrigins). There is no allow-any-origin default outside Development.");
        }
    }
}
