using ClinicEz.Shared.Interop.Background;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Interop;

public static class InteropServiceCollectionExtensions
{
    private const string HubHttpClientName = "clinicez-interop-hub";

    /// <summary>
    /// Wires the interop SDK into a service. <typeparamref name="TDbContext"/> must implement
    /// <see cref="IInteropDbContext"/> and call <c>modelBuilder.ApplyInteropModel()</c>.
    /// Configuration section: <c>Messaging</c> (see <see cref="InteropOptions"/>). Options are validated at
    /// host start, and the transport (Hub vs InProcess) is chosen when first resolved, so test hosts can
    /// override configuration after service registration.
    /// </summary>
    public static IServiceCollection AddInterop<TDbContext>(
        this IServiceCollection services,
        IConfiguration configuration,
        Action<InteropHandlerBuilder>? configureHandlers = null)
        where TDbContext : DbContext, IInteropDbContext
    {
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IHostedService, InteropStartupCheck>());

        services.AddOptions<InteropOptions>()
            .Bind(configuration.GetSection(InteropOptions.Section))
            .Validate(o =>
            {
                o.Validate();
                return true;
            })
            .ValidateOnStart();

        var registry = new InteropHandlerRegistry();
        configureHandlers?.Invoke(new InteropHandlerBuilder(services, registry));
        services.AddSingleton(registry);

        services.TryAddSingleton(sp =>
        {
            var o = sp.GetRequiredService<IOptions<InteropOptions>>().Value;
            return o.IsInProcess ? new EnvelopeSigner(null, null) : new EnvelopeSigner(o.SigningKey, o.ClientId);
        });
        services.TryAddSingleton<EnvelopeVerifier>();

        services.TryAddScoped<IInteropDbContext>(sp => sp.GetRequiredService<TDbContext>());
        services.TryAddScoped<IInteropPublisher, InteropPublisher>();
        services.TryAddSingleton<InteropDispatcher>();

        services.AddHttpClient(HubHttpClientName);
        services.TryAddSingleton<InProcessHub>();
        services.TryAddScoped<IHubClient>(sp =>
        {
            var options = sp.GetRequiredService<IOptions<InteropOptions>>();
            return options.Value.IsInProcess
                ? new InProcessHubClient(sp.GetRequiredService<InProcessHub>())
                : new HubHttpClient(sp.GetRequiredService<IHttpClientFactory>().CreateClient(HubHttpClientName), options);
        });
        services.TryAddSingleton<InProcessHubClaimsClient>();
        services.TryAddScoped<IHubClaimsClient>(sp =>
        {
            var options = sp.GetRequiredService<IOptions<InteropOptions>>();
            return options.Value.IsInProcess
                ? sp.GetRequiredService<InProcessHubClaimsClient>()
                : new HubClaimsHttpClient(sp.GetRequiredService<IHttpClientFactory>().CreateClient(HubHttpClientName), options, sp.GetRequiredService<EnvelopeSigner>());
        });

        services.TryAddSingleton<InteropRelayService>();
        services.TryAddSingleton<InteropInboxPollerService>();
        services.AddHostedService(sp => sp.GetRequiredService<InteropRelayService>());
        services.AddHostedService(sp => sp.GetRequiredService<InteropInboxPollerService>());

        return services;
    }
}
