using System.Threading.RateLimiting;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Features.PublicUploads;
using ClinicEz.Shared.Middlewares;
using ClinicEz.Portal.Api.Extensions;
using Microsoft.Extensions.Options;
namespace ClinicEz.Portal.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddApiServices(this IServiceCollection services)
    {
        services.AddEndpoints(typeof(DependencyInjection).Assembly);
        services.AddEndpointsApiExplorer();

        services.AddOpenApi();

        // 3. Add our custom global exception handler
        services.AddExceptionHandler<CodedConflictExceptionHandler>();
        services.AddExceptionHandler<EntitlementExceptionHandler>();
        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();

        // The anonymous contact form can trigger outbound email, so each client address gets a small allowance.
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(ContactEndpoints.RateLimitPolicy, httpContext =>
                RateLimitPartition.GetFixedWindowLimiter(
                    httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 5,
                        Window = TimeSpan.FromMinutes(10),
                        QueueLimit = 0
                    }));

            // The anonymous external-lab upload relay carries files, so it is limited per client address too (LabUploads:RateLimit*).
            options.AddPolicy(PublicLabUploadEndpoints.RateLimitPolicy, httpContext =>
            {
                var limits = httpContext.RequestServices.GetRequiredService<IOptions<LabUploadOptions>>().Value;
                return RateLimitPartition.GetFixedWindowLimiter(
                    httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = Math.Max(1, limits.RateLimitPermits),
                        Window = TimeSpan.FromMinutes(Math.Max(1, limits.RateLimitWindowMinutes)),
                        QueueLimit = 0
                    });
            });
        });
        return services;
    }
}
