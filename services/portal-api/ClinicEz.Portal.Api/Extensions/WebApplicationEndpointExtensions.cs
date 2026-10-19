using System.Reflection;
using ClinicEz.Portal.Api.Abstractions;

namespace ClinicEz.Portal.Api.Extensions;

public static class WebApplicationEndpointExtensions
{
    /// <summary>Discovers all <see cref="IEndpoint"/> implementations and registers them as singletons.</summary>
    public static IServiceCollection AddEndpoints(this IServiceCollection services, Assembly assembly)
    {
        var types = assembly
            .GetTypes()
            .Where(t => !t.IsAbstract && !t.IsInterface && typeof(IEndpoint).IsAssignableFrom(t));

        foreach (var type in types)
            services.AddSingleton(typeof(IEndpoint), type);

        return services;
    }

    /// <summary>Resolves every registered <see cref="IEndpoint"/> and maps it under <paramref name="prefix"/>.</summary>
    public static WebApplication MapApiEndpoints(this WebApplication app, string prefix = "/api/v1")
    {
        var endpoints = app.Services.GetRequiredService<IEnumerable<IEndpoint>>();
        var group = app.MapGroup(prefix);

        foreach (var endpoint in endpoints)
            endpoint.MapEndpoint(group);

        return app;
    }
}
