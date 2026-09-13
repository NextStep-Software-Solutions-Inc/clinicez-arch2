using MainPortalBE.Application.Common.Exceptions;

public static class EnumValidator
{
    public static ValidationResult ValidateEnum<TEnum>(string? value, string fieldName) where TEnum : struct, Enum
    {
        if (string.IsNullOrWhiteSpace(value) || !Enum.TryParse<TEnum>(value, true, out _))
        {
            return ValidationResult.Fail(
                $"Invalid {fieldName} '{value}'. Allowed values: {string.Join(", ", Enum.GetNames(typeof(TEnum)))}"
            );
        }

        return ValidationResult.Success();
    }

    public static ValidationResult ValidateAll(params (Type EnumType, string? Value, string FieldName)[] validations)
    {
        foreach (var (enumType, value, fieldName) in validations)
        {
            if (string.IsNullOrWhiteSpace(value) || !Enum.TryParse(enumType, value, true, out _))
            {
                return ValidationResult.Fail(
                    $"Invalid {fieldName} '{value}'. Allowed values: {string.Join(", ", Enum.GetNames(enumType))}"
                );
            }
        }

        return ValidationResult.Success();
    }
}


