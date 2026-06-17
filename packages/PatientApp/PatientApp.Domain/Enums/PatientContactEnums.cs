namespace PatientApp.Domain.Enums;

public enum AddressType { Home, Work, Temporary }

public enum GovernmentIdType
{
    PhilSys, SSS, GSIS, PhilHealth,
    Passport, DriversLicense, PRC, Voter, TIN
}

public enum FamilyRelation
{
    Mother, Father, Sibling,
    PaternalGrandparent, MaternalGrandparent,
    Aunt, Uncle, Cousin, Other
}
