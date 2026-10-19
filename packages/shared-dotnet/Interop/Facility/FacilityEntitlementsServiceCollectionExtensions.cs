using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ClinicEz.Shared.Interop.Facility;

/// <summary>
/// Wiring for the facility-side entitlement and heartbeat machinery. A service only implements
/// <see cref="IFacilityLicenseStore"/> and <see cref="IFacilityRegistry"/>:
/// <code>
/// services.AddFacilityEntitlements&lt;MyLicenseStore&gt;().AddFacilityHeartbeat&lt;MyFacilityRegistry&gt;();
/// services.AddInterop&lt;MyDb&gt;(config, h =&gt; h.HandleEntitlementsChanged() /* plus its own handlers */);
/// </code>
/// </summary>
public static class FacilityEntitlementsServiceCollectionExtensions
{
    /// <summary>Registers the service's license store and the authority-key license validator (if none is registered yet).</summary>
    public static IServiceCollection AddFacilityEntitlements<TStore>(this IServiceCollection services)
        where TStore : class, IFacilityLicenseStore
    {
        services.AddScoped<IFacilityLicenseStore, TStore>();
        services.TryAddSingleton<IFacilityLicenseValidator, FacilityLicenseValidator>();
        return services;
    }

    /// <summary>Registers the service's facility registry and starts <see cref="FacilityHeartbeatService"/> with the host.</summary>
    public static IServiceCollection AddFacilityHeartbeat<TRegistry>(this IServiceCollection services)
        where TRegistry : class, IFacilityRegistry
    {
        services.AddScoped<IFacilityRegistry, TRegistry>();
        services.TryAddSingleton<FacilityHeartbeatService>();
        services.AddHostedService(sp => sp.GetRequiredService<FacilityHeartbeatService>());
        return services;
    }

    /// <summary>Routes <c>entitlements.changed</c> to <see cref="EntitlementsChangedHandler"/>. Call inside the <c>AddInterop</c> handler configuration.</summary>
    public static InteropHandlerBuilder HandleEntitlementsChanged(this InteropHandlerBuilder handlers) =>
        handlers.Handle<EntitlementsChangedEvent, EntitlementsChangedHandler>(InteropTypes.EntitlementsChanged);
}
