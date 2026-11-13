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
        services.PostConfigure<LiveKitOptions>(opts =>
        {
            if (configuration["LIVEKIT_URL"] is { } relayUrl && !string.IsNullOrWhiteSpace(relayUrl))
                opts.RelayUrl = relayUrl.Trim();
            if (configuration["LIVEKIT_API_KEY"] is { } apiKey && !string.IsNullOrWhiteSpace(apiKey))
                opts.ApiKey = apiKey.Trim();
            if (configuration["LIVEKIT_API_SECRET"] is { } apiSecret && !string.IsNullOrWhiteSpace(apiSecret))
                opts.ApiSecret = apiSecret.Trim();
        });
        services.Configure<MediaMeteringOptions>(configuration.GetSection(MediaMeteringOptions.Section));

        services.AddScoped<ILiveKitTokenService, LiveKitTokenService>();
        services.AddScoped<IMediaMeteringService, MediaMeteringService>();

        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssembly(typeof(DependencyInjection).Assembly);
        });

        return services;
    }
}
