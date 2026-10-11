namespace ClinicEz.Billing.Infrastructure.Auth;

/// <summary>Claim names of a billing session token. Permissions are NOT trusted from the token: they are re-derived from the staff row.</summary>
public static class BillingClaimTypes
{
    public const string Subject = "sub";
    public const string TenantId = "tenant_id";
    public const string FacilityId = "facility_id";
    public const string TokenVersion = "ver";
    public const string StaffRole = "staff_role";
    public const string Name = "name";
    public const string Permission = "permission";
}
