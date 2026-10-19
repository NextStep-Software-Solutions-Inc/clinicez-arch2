using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Shared.Search;

/// <summary>
/// Dependency injection registration extensions for pluggable search providers using standard .NET reflection.
/// Provides zero-touch discovery without requiring third-party libraries (Scrutor).
/// </summary>
public static class SearchServiceExtensions
{
    /// <summary>
    /// Scans the assembly containing <typeparamref name="TAssemblyMarker"/> and registers all
    /// non-abstract, concrete classes implementing <see cref="ISearchProvider"/> as scoped services.
    /// </summary>
    /// <typeparam name="TAssemblyMarker">A type located in the target assembly to scan.</typeparam>
    /// <param name="services">The service collection to register into.</param>
    /// <returns>The service collection for method chaining.</returns>
    public static IServiceCollection AddPluggableSearch<TAssemblyMarker>(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);
        return services.AddPluggableSearch(typeof(TAssemblyMarker).Assembly);
    }

    /// <summary>
    /// Scans the specified assembly and registers all non-abstract, concrete classes
    /// implementing <see cref="ISearchProvider"/> as scoped services.
    /// </summary>
    /// <param name="services">The service collection to register into.</param>
    /// <param name="assembly">The assembly to scan.</param>
    /// <returns>The service collection for method chaining.</returns>
    public static IServiceCollection AddPluggableSearch(this IServiceCollection services, Assembly assembly)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(assembly);

        return services.AddPluggableSearch([assembly]);
    }

    /// <summary>
    /// Scans one or more assemblies and registers all non-abstract, concrete classes
    /// implementing <see cref="ISearchProvider"/> as scoped services.
    /// Ensures idempotent registration (calling multiple times will not create duplicate descriptors).
    /// </summary>
    /// <param name="services">The service collection to register into.</param>
    /// <param name="assemblies">The assemblies to scan.</param>
    /// <returns>The service collection for method chaining.</returns>
    public static IServiceCollection AddPluggableSearch(this IServiceCollection services, params Assembly[] assemblies)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(assemblies);

        var providerInterfaceType = typeof(ISearchProvider);

        foreach (var assembly in assemblies)
        {
            if (assembly == null) continue;

            IEnumerable<Type> candidateTypes;
            try
            {
                candidateTypes = assembly.GetTypes();
            }
            catch (ReflectionTypeLoadException ex)
            {
                candidateTypes = ex.Types.Where(t => t != null)!;
            }

            var providerImplementations = candidateTypes
                .Where(t => t is { IsClass: true, IsAbstract: false, IsGenericTypeDefinition: false, ContainsGenericParameters: false }
                            && t.GetConstructors(BindingFlags.Public | BindingFlags.Instance).Any()
                            && providerInterfaceType.IsAssignableFrom(t));

            foreach (var impl in providerImplementations)
            {
                // Register as ISearchProvider idempotently
                if (!services.Any(d => d.ServiceType == providerInterfaceType && d.ImplementationType == impl))
                {
                    services.AddScoped(providerInterfaceType, impl);
                }

                // Also register concrete type for direct resolution in tests or specific callers
                if (!services.Any(d => d.ServiceType == impl && d.ImplementationType == impl))
                {
                    services.AddScoped(impl);
                }
            }
        }

        return services;
    }
}
