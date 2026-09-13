namespace ClinicEz.Patient.Domain.Enums;

public enum AddressType { Home, Work, Temporary }

public enum GovernmentIdType
{
    PhilSys, SSS, GSIS, PhilHealth,
    Passport, DriversLicense, PRC, Voter, TIN,
    PagIbig, SeniorCitizen, PWD, HMO
}

public enum FamilyRelation
{
    Mother, Father, Sibling,
    PaternalGrandparent, MaternalGrandparent,
    Aunt, Uncle, Cousin, Other
}
