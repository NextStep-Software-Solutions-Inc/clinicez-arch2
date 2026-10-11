using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace ClinicEz.Shared.Common;

/// <summary>
/// Guard for the "enums are stored as strings" rule. Use from a unit test of each DbContext:
/// <c>Assert.Empty(StringEnumModel.FindNonStringEnumProperties(db.Model));</c>
/// </summary>
public static class StringEnumModel
{
    /// <summary>
    /// Returns <c>Entity.Property</c> for every enum-typed (or nullable-enum-typed) property whose database provider
    /// type is not <see cref="string"/>. Entities mapped without a table (keyless views) are included.
    /// </summary>
    public static IReadOnlyList<string> FindNonStringEnumProperties(IModel model)
    {
        ArgumentNullException.ThrowIfNull(model);
        var offenders = new List<string>();
        foreach (var entity in model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                var clr = Nullable.GetUnderlyingType(property.ClrType) ?? property.ClrType;
                if (!clr.IsEnum) continue;

                var providerType = property.GetProviderClrType() ?? property.GetValueConverter()?.ProviderClrType ?? property.ClrType;
                if (providerType != typeof(string))
                    offenders.Add($"{entity.DisplayName()}.{property.Name}");
            }
        }

        return offenders;
    }
}
