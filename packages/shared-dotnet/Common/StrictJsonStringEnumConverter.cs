using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Shared.Common;

/// <summary>
/// The platform rule for enums on the wire: always the member name as a string, never a number. Unlike the stock
/// <see cref="JsonStringEnumConverter"/> this one rejects numeric JSON values (they fail deserialization, which
/// the APIs surface as a 400) instead of silently accepting <c>1</c> as an enum value.
/// </summary>
public sealed class StrictJsonStringEnumConverter : JsonStringEnumConverter
{
    public StrictJsonStringEnumConverter() : base(namingPolicy: null, allowIntegerValues: false)
    {
    }
}

public static class StringEnumJsonExtensions
{
    /// <summary>Adds <see cref="StrictJsonStringEnumConverter"/> to <paramref name="options"/> (once).</summary>
    public static JsonSerializerOptions UseStrictStringEnums(this JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (!options.Converters.OfType<StrictJsonStringEnumConverter>().Any())
            options.Converters.Add(new StrictJsonStringEnumConverter());
        return options;
    }

    /// <summary>
    /// Makes the minimal-API and MVC JSON pipelines read and write enums as strings only, and MVC query/route binding accept\n    /// enum member names only (<see cref="StringEnumModelBinderProvider"/>). Call once from
    /// <c>Program.cs</c>: <c>builder.Services.AddStrictStringEnums();</c>
    /// </summary>
    public static IServiceCollection AddStrictStringEnums(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);
        services.ConfigureHttpJsonOptions(o => o.SerializerOptions.UseStrictStringEnums());
        services.Configure<Microsoft.AspNetCore.Mvc.JsonOptions>(o => o.JsonSerializerOptions.UseStrictStringEnums());
        services.Configure<Microsoft.AspNetCore.Mvc.MvcOptions>(o =>
        {
            if (!o.ModelBinderProviders.OfType<StringEnumModelBinderProvider>().Any())
                o.ModelBinderProviders.Insert(0, new StringEnumModelBinderProvider());
        });
        return services;
    }
}
