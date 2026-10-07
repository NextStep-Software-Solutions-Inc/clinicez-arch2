namespace ClinicEz.Patient.Domain.Enums;

public enum SexType { Male, Female, Other }

public enum CivilStatus { Single, Married, Widowed, Separated, Divorced }

public enum BloodType
{
    APositive, ANegative,
    BPositive, BNegative,
    ABPositive, ABNegative,
    OPositive, ONegative,
    Unknown
}

public enum EducationLevel
{
    None, Elementary, HighSchool, Vocational,
    College, Graduate, PostGraduate
}

public static class BloodTypeParser
{
    public static bool TryParse(string? value, out BloodType result)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            result = default;
            return false;
        }

        var trimmed = value.Trim();

        if (Enum.TryParse<BloodType>(trimmed, true, out result))
        {
            return true;
        }

        switch (trimmed.ToUpperInvariant())
        {
            case "A+":
            case "A POSITIVE":
                result = BloodType.APositive;
                return true;
            case "A-":
            case "A NEGATIVE":
                result = BloodType.ANegative;
                return true;
            case "B+":
            case "B POSITIVE":
                result = BloodType.BPositive;
                return true;
            case "B-":
            case "B NEGATIVE":
                result = BloodType.BNegative;
                return true;
            case "AB+":
            case "AB POSITIVE":
                result = BloodType.ABPositive;
                return true;
            case "AB-":
            case "AB NEGATIVE":
                result = BloodType.ABNegative;
                return true;
            case "O+":
            case "O POSITIVE":
                result = BloodType.OPositive;
                return true;
            case "O-":
            case "O NEGATIVE":
                result = BloodType.ONegative;
                return true;
            case "UNKNOWN":
                result = BloodType.Unknown;
                return true;
            default:
                result = default;
                return false;
        }
    }
}

