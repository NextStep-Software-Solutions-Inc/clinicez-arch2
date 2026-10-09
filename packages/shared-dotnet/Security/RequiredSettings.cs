using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Shared.Security;

/// <summary>Start-up guard for secrets and endpoints that must come from configuration: no built-in defaults, fail fast outside Development.</summary>
public static class RequiredSettings
{
    /// <summary>
    /// Throws an <see cref="InvalidOperationException"/> naming every missing key (and its environment variable form)
    /// when the host is not Development. In Development missing keys are tolerated so local runs need no secrets.
    /// </summary>
    public static void EnsureConfigured(IConfiguration configuration, IHostEnvironment environment, params string[] keys)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);
        if (environment.IsDevelopment()) return;

        var missing = keys.Where(key => string.IsNullOrWhiteSpace(configuration[key])).ToList();
        if (missing.Count == 0) return;

        throw new InvalidOperationException(
            "Required configuration is missing: " +
            string.Join(", ", missing.Select(key => $"{key} (env {key.Replace(":", "__")})")) +
            ". There are no built-in defaults outside Development.");
    }
}
