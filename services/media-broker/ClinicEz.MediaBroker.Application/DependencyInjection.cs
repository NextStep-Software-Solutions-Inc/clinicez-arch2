using ClinicEz.MediaBroker.Application.Common.Interfaces;
using ClinicEz.MediaBroker.Application.Common.Options;
using ClinicEz.MediaBroker.Application.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.MediaBroker.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddMediaBrokerApplication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<LiveKitOptions>(configuration.GetSection(LiveKitOptions.Section));

        services.AddScoped<ILiveKitTokenService, LiveKitTokenService>();
        services.AddScoped<IMediaMeteringService, MediaMeteringService>();

        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssembly(typeof(DependencyInjection).Assembly);
        });

        return services;
    }
}
