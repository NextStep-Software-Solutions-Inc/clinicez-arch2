namespace PatientAppBE.Domain.Enums;

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
