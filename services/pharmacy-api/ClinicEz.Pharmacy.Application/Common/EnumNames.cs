namespace ClinicEz.Pharmacy.Application.Common;

/// <summary>
/// Parses enum values that arrive as text (query strings, string request fields) by their C# name only. The numeric
/// forms that <see cref="Enum.TryParse{TEnum}(string?, bool, out TEnum)"/> accepts ("1", "-1") are rejected, so enums are
/// never addressed by number on the wire.
/// </summary>
public static class EnumNames
{
    public static bool TryParse<TEnum>(string? value, out TEnum result) where TEnum : struct, Enum
    {
        result = default;
        var name = value?.Trim();
        if (string.IsNullOrEmpty(name) || !char.IsLetter(name[0]) || !name.All(char.IsLetterOrDigit))
        {
            return false;
        }

        return Enum.TryParse(name, ignoreCase: true, out result) && Enum.IsDefined(result);
    }

    /// <summary>The defined names, for "must be one of" messages.</summary>
    public static string Names<TEnum>() where TEnum : struct, Enum => string.Join(", ", Enum.GetNames<TEnum>());
}
