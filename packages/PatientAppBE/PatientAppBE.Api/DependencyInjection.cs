using Clinic EZ.Shared.Middlewares;
using Microsoft.Extensions.DependencyInjection;
using PatientAppBE.Api.Extensions;
using PatientAppBE.Api.Infrastructure;
using PatientAppBE.Api.Services;
using PatientAppBE.Application.Common.Interfaces;

namespace PatientAppBE.Api;

public static class DependencyInjection
{
    public static IServiceCollection AddApiServices(this IServiceCollection services)
    {
        services.AddCors();
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



