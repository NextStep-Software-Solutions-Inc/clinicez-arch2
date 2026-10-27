using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Infrastructure.Authentication;
using ClinicEz.Comms.Infrastructure.BackgroundServices;
using ClinicEz.Comms.Infrastructure.Hubs;
using ClinicEz.Comms.Infrastructure.Messaging.Handlers;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Comms.Infrastructure.Realtime;
using ClinicEz.Comms.Infrastructure.Security;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.Infrastructure.Storage;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Comms.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddCommsInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=CLINICEZ_COMMS_DB;Username=clinicez;Password=clinicez";

        var schemaName = configuration["DbSchema"] ?? "comms";

        services.AddDbContext<CommsDbContext>(options =>
        {
            options.UseNpgsql(connectionString, npgsql =>
            {
                npgsql.MigrationsHistoryTable("__EFMigrationsHistory", schemaName);
            });
        });

        services.AddScoped<ICommsDbContext>(sp => sp.GetRequiredService<CommsDbContext>());
        services.AddScoped<IInteropDbContext>(sp => sp.GetRequiredService<CommsDbContext>());

        services.AddScoped<IAttachmentPipeline, AttachmentPipeline>();
        services.AddScoped<ICommsStorageService, LocalCommsStorageService>();
        services.AddScoped<ICommsRealtimeNotifier, CommsRealtimeNotifier>();
        services.AddScoped<ITranscriptSerializer, TranscriptSerializer>();

        services.AddHostedService<DeliveryRetentionSweeper>();

        services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = CommsTicketAuthenticationDefaults.AuthenticationScheme;
            options.DefaultChallengeScheme = CommsTicketAuthenticationDefaults.AuthenticationScheme;
        })
        .AddScheme<CommsTicketAuthenticationOptions, CommsTicketAuthenticationHandler>(
            CommsTicketAuthenticationDefaults.AuthenticationScheme,
            _ => { });

        services.AddSignalR();

        services.AddInterop<CommsDbContext>(configuration, handlers => handlers
            .Handle<CommsEligibilityGrantedPayload, CommsEligibilityGrantedHandler>(InteropTypes.CommsEligibilityGranted)
            .Handle<CommsEligibilityRevokedPayload, CommsEligibilityRevokedHandler>(InteropTypes.CommsEligibilityRevoked));

        return services;
    }
}
