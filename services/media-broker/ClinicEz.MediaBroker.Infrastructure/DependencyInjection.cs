using ClinicEz.MediaBroker.Application.Common.Interfaces;
using ClinicEz.MediaBroker.Application.Features.Entitlements.Handlers;
using ClinicEz.MediaBroker.Application.Features.Rooms.Handlers;
using ClinicEz.MediaBroker.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.MediaBroker.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddMediaBrokerInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=CLINICEZ_MEDIA_DB;Username=clinicez;Password=clinicez";

        var schemaName = configuration["DbSchema"] ?? "media";

        services.AddDbContext<MediaBrokerDbContext>(options =>
        {
            options.UseNpgsql(connectionString, npgsql =>
            {
                npgsql.MigrationsHistoryTable("__EFMigrationsHistory", schemaName);
            });
        });

        services.AddScoped<IMediaBrokerDbContext>(sp => sp.GetRequiredService<MediaBrokerDbContext>());
        services.AddScoped<IInteropDbContext>(sp => sp.GetRequiredService<MediaBrokerDbContext>());

        services.AddInterop<MediaBrokerDbContext>(configuration, handlers => handlers
            .Respond<MediaRoomRequestedPayload, MediaRoomRespondedPayload, MediaRoomRequestedHandler>(
                InteropTypes.MediaRoomRequested, InteropTypes.MediaRoomResponded)
            .Handle<MediaEntitlementUpdatedPayload, MediaEntitlementUpdatedHandler>(
                InteropTypes.MediaEntitlementUpdated));

        return services;
    }
}
