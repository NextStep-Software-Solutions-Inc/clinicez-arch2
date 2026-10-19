namespace ClinicEz.Pharmacy.Infrastructure.Context;

/// <summary>Claim names used in facility-local pharmacy tokens.</summary>
public static class PharmacyClaimTypes
{
    public const string Subject = "sub";
    public const string TenantId = "tenant_id";
    public const string PharmacyId = "pharmacy_id";
    public const string Permission = "permission";
    public const string TokenVersion = "ver";
    public const string StaffRole = "staff_role";
    public const string Name = "name";
}