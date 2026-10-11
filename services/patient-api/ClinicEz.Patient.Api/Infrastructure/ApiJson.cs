using System.Text.Json;
using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;

namespace ClinicEz.Patient.Api.Infrastructure;

/// <summary>The JSON contract of the patient API: camelCase properties, enums as member-name strings and never as numbers.</summary>
public static class ApiJson
{
    public static JsonSerializerOptions Configure(JsonSerializerOptions options)
    {
        options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        return options.UseStrictStringEnums();
    }
}