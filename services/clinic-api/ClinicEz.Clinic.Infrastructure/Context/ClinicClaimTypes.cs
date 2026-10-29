namespace ClinicEz.Clinic.Infrastructure.Context;

/// <summary>Claim names used in facility-local clinic tokens.</summary>
public static class ClinicClaimTypes
{
    public const string Subject = "sub";
    public const string TenantId = "tenant_id";
    public const string ClinicId = "clinic_id";
    public const string BranchId = "branch_id";
    public const string Permission = "permission";
    public const string TokenVersion = "ver";
    public const string RoleId = "role_id";
    public const string StaffRole = "staff_role";
    public const string Name = "name";
    public const string Email = "email";
    public const string TokenType = "token_type";
}
