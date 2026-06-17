using CLINICEZ.Shared.Middlewares;
using Microsoft.Extensions.DependencyInjection;
using PatientApp.Api.Extensions;
using PatientApp.Api.Infrastructure;
using PatientApp.Api.Services;
using PatientApp.Application.Common.Interfaces;

namespace PatientApp.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddApiServices(this IServiceCollection services)
    {
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



