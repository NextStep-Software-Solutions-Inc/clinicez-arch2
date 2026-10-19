using ClinicEz.Shared.Middlewares;
using Microsoft.Extensions.DependencyInjection;
using ClinicEz.Patient.Api.Extensions;
using ClinicEz.Patient.Api.Infrastructure;
using ClinicEz.Patient.Api.Services;
using ClinicEz.Patient.Application.Common.Interfaces;

namespace ClinicEz.Patient.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddApiServices(
        this IServiceCollection services,
        IConfiguration configuration,
        IWebHostEnvironment environment)
    {
        services.AddClinicEzCors(configuration, environment);
        services.AddOpenApi();

        services.AddExceptionHandler<GlobalExceptionHandler>();
        services.AddProblemDetails();

        services.AddAuthorization();
        services.AddSignalR();

        services.AddEndpoints(typeof(DependencyInjection).Assembly);
        services.AddSingleton<HangfireDashboardBasicAuthFilter>();

        // ISyncNotificationService lives here because it depends on IHubContext<SyncHub>
        // which is only available after AddSignalR() is called in this (API) layer.
        services.AddSingleton<ISyncNotificationService, SignalRSyncNotificationService>();

        return services;
    }
}



