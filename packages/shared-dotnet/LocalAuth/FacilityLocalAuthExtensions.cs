using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.Threading.RateLimiting;

namespace ClinicEz.Shared.LocalAuth;

public static class FacilityLocalAuthExtensions
{
    public const string AuthRateLimitPolicy = "facility-auth";

    /// <summary>
    /// Registers facility-local authentication: HMAC-signed JWT bearer (validated entirely locally, no internet,
    /// no identity provider) plus an internal service-key scheme, and a secure-by-default fallback policy.
    /// Only endpoints marked <c>[AllowAnonymous]</c> are reachable without credentials.
    /// </summary>
    /// <param name="audience">Distinct per service. Prevents a token from one service being accepted by another.</param>
    /// <param name="onTokenValidated">Optional hook to enrich/reject the principal (e.g. token version check, permission claims).</param>
    public static IServiceCollection AddFacilityLocalAuth(
        this IServiceCollection services,
        IConfiguration configuration,
        string audience,
        Func<TokenValidatedContext, Task>? onTokenValidated = null)
    {
        services.AddOptions<FacilityJwtOptions>()
            .Bind(configuration.GetSection(FacilityJwtOptions.SectionName))
            .PostConfigure(o =>
            {
                if (string.IsNullOrWhiteSpace(o.Audience)) o.Audience = audience;
                if (string.IsNullOrWhiteSpace(o.Issuer)) o.Issuer = o.Audience;
            });
        services.AddOptions<InternalKeyOptions>().Bind(configuration.GetSection(InternalKeyOptions.SectionName));

        services.AddSingleton<IFacilityTokenService, FacilityTokenService>();
        services.AddSingleton<IFacilityPasswordHasher, FacilityPasswordHasher>();

        services.AddAuthentication(FacilityAuthSchemes.Facility)
            .AddJwtBearer(FacilityAuthSchemes.Facility, _ => { })
            .AddScheme<AuthenticationSchemeOptions, InternalKeyAuthenticationHandler>(FacilityAuthSchemes.Internal, _ => { });

        services.AddOptions<JwtBearerOptions>(FacilityAuthSchemes.Facility)
            .Configure<IFacilityTokenService>((bearer, tokens) =>
            {
                var jwt = tokens.Options;
                bearer.MapInboundClaims = false;
                bearer.RequireHttpsMetadata = false;
                bearer.SaveToken = false;
                bearer.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwt.Issuer,
                    ValidateAudience = true,
                    ValidAudience = jwt.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = tokens.SecurityKey,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(jwt.ClockSkewMinutes),
                    NameClaimType = "sub",
                    RoleClaimType = "role",
                    ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 }
                };
                if (onTokenValidated is not null)
                {
                    bearer.Events = new JwtBearerEvents { OnTokenValidated = onTokenValidated };
                }
            });

        services.AddAuthorization(o =>
        {
            o.FallbackPolicy = new AuthorizationPolicyBuilder(FacilityAuthSchemes.Facility, FacilityAuthSchemes.Internal)
                .RequireAuthenticatedUser()
                .Build();
        });

        return services;
    }
}
