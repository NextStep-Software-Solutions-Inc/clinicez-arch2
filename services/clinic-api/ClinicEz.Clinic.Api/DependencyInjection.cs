using ClinicEz.Clinic.Api.Middlewares;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Middlewares;

namespace ClinicEz.Clinic.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddApiServices(this IServiceCollection services)
    {
        services.AddControllers();
        services.AddStrictStringEnums();
        services.AddOpenApi();

        services.AddAuthorization(options =>
        {
            options.AddPolicy(ClinicEz.Clinic.Domain.Constants.ClinicPolicies.KioskIntake, policy =>
                policy.RequireAssertion(ctx =>
                    ctx.User.Identity?.IsAuthenticated == true &&
                    ctx.User.HasClaim(ClinicEz.Clinic.Infrastructure.Context.ClinicClaimTypes.TokenType, "kiosk") &&
                    !string.IsNullOrWhiteSpace(ctx.User.FindFirst(ClinicEz.Clinic.Infrastructure.Context.ClinicClaimTypes.ClinicId)?.Value)));

            options.AddPolicy(ClinicEz.Clinic.Domain.Constants.ClinicPermissions.AuditRead, policy =>
                policy.RequireAssertion(ctx =>
                    ctx.User.HasClaim(ClinicEz.Clinic.Infrastructure.Context.ClinicClaimTypes.Permission, ClinicEz.Clinic.Domain.Constants.ClinicPermissions.AuditRead) ||
                    ctx.User.HasClaim(ClinicEz.Clinic.Infrastructure.Context.ClinicClaimTypes.Permission, "*")));

            options.AddPolicy(ClinicEz.Clinic.Domain.Constants.ClinicPermissions.AuditExport, policy =>
                policy.RequireAssertion(ctx =>
                    ctx.User.HasClaim(ClinicEz.Clinic.Infrastructure.Context.ClinicClaimTypes.Permission, ClinicEz.Clinic.Domain.Constants.ClinicPermissions.AuditExport) ||
                    ctx.User.HasClaim(ClinicEz.Clinic.Infrastructure.Context.ClinicClaimTypes.Permission, "*")));
        });

        // 3. Add our custom exception handlers: the clinic's coded failures first, the shared handler maps everything else.
        services.AddExceptionHandler<ClinicExceptionHandler>();
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();

        // Expired subscriptions: read-only inside the grace window, blocked after it. Sign-in and license installation stay
        // reachable so a renewed license can always be applied; the anonymous public endpoints (patient upload, e-Rx and
        // document verification, student intake) are not staff sessions and are never enforced.
        services.AddReadOnlyGrace<ClinicLicenseState>(
            "/api/v1/auth",
            "/api/v1/license",
            "/api/v1/clinic/license",
            "/api/v1/public",
            "/api/v1/patients/public",
            "/health",
            "/hangfire");
        return services;
    }
}
