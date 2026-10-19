using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Shared.Security.ClaimTokens;

public static class ClaimTokenServiceExtensions
{
    /// <summary>
    /// Registers <see cref="IClaimTokenService"/> as a singleton using <see cref="ClaimTokenService"/>.
    /// </summary>
    public static IServiceCollection AddClaimTokenService(this IServiceCollection services, string? signingKey = null)
    {
        if (!string.IsNullOrWhiteSpace(signingKey))
        {
            services.Configure<ClaimTokenOptions>(opts => opts.SigningKey = signingKey);
        }

        services.AddSingleton<IClaimTokenService, ClaimTokenService>();
        return services;
    }
}
