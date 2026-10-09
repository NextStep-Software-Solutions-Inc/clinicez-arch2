namespace ClinicEz.Portal.Domain.Common;

/// <summary>Parses enum names from text and refuses numbers, which <see cref="Enum.TryParse{TEnum}(string?, bool, out TEnum)"/> would accept.</summary>
public static class StrictEnum
{
    public static bool TryParse<TEnum>(string? value, out TEnum result) where TEnum : struct, Enum
    {
        result = default;
        return IsName(value) && Enum.TryParse(value, ignoreCase: true, out result) && Enum.IsDefined(result);
    }

    /// <summary>True when the text is an enum member name (it must start with a letter), never a number.</summary>
    public static bool IsName(string? value)
    {
        return !string.IsNullOrWhiteSpace(value) && char.IsLetter(value.Trim()[0]);
    }
}
