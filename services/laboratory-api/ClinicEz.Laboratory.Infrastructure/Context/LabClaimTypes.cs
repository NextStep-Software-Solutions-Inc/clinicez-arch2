namespace ClinicEz.Laboratory.Infrastructure.Context;

/// <summary>Claim names used in facility-local laboratory tokens.</summary>
public static class LabClaimTypes
{
    public const string Subject = "sub";
    public const string TenantId = "tenant_id";
    public const string LaboratoryId = "laboratory_id";
    public const string Permission = "permission";
    public const string TokenVersion = "ver";
    public const string StaffRole = "staff_role";
    public const string Name = "name";
}
