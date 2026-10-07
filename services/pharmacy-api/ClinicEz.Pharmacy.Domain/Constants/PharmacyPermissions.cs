using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Pharmacy.Domain.Enums;

namespace ClinicEz.Pharmacy.Domain.Constants;

/// <summary>Permission names carried in facility-local pharmacy tokens and enforced by <c>[HasPermission]</c>.</summary>
public static class PharmacyPermissions
{
    public const string InventoryRead = "inventory:read";
    public const string InventoryReceive = "inventory:receive";
    public const string InventoryManage = "inventory:manage";

    public const string PrescriptionsRead = "prescriptions:read";
    public const string PrescriptionsDispense = "prescriptions:dispense";

    public const string GamotRead = "gamot:read";
    public const string GamotValidate = "gamot:validate";
    public const string GamotGenerate = "gamot:generate";
    public const string GamotDispense = "gamot:dispense";
    public const string GamotReverse = "gamot:reverse";

    public const string StaffRead = "staff:read";
    public const string StaffManage = "staff:manage";

    /// <summary>
    /// Permission set granted to trusted internal services (authenticated by the shared internal key), e.g. clinic-api
    /// server-side proxying GAMOT operations. Deliberately limited to GAMOT: never staff, auth, inventory or prescriptions.
    /// </summary>
    public static readonly IReadOnlyList<string> InternalService = new List<string>
    {
        GamotRead,
        GamotValidate,
        GamotGenerate,
        GamotDispense,
        GamotReverse
    }.AsReadOnly();

    public static readonly IReadOnlyList<string> All = new List<string>
    {
        InventoryRead,
        InventoryReceive,
        InventoryManage,
        PrescriptionsRead,
        PrescriptionsDispense,
        GamotRead,
        GamotValidate,
        GamotGenerate,
        GamotDispense,
        GamotReverse,
        StaffRead,
        StaffManage
    }.AsReadOnly();
}

/// <summary>Maps each <see cref="PharmacyStaffRole"/> to its least-privilege permission set.</summary>
public static class PharmacyRolePermissions
{
    private static readonly IReadOnlyDictionary<PharmacyStaffRole, IReadOnlyList<string>> Map =
        new Dictionary<PharmacyStaffRole, IReadOnlyList<string>>
        {
            // The pharmacy administrator: full access, including staff/credential management and inventory seeding.
            [PharmacyStaffRole.ChiefPharmacist] = PharmacyPermissions.All,

            // Dispenses (regular and PhilHealth GAMOT), reverses GAMOT transactions and receives stock.
            [PharmacyStaffRole.StaffPharmacist] = new[]
            {
                PharmacyPermissions.PrescriptionsRead,
                PharmacyPermissions.PrescriptionsDispense,
                PharmacyPermissions.InventoryRead,
                PharmacyPermissions.InventoryReceive,
                PharmacyPermissions.GamotRead,
                PharmacyPermissions.GamotValidate,
                PharmacyPermissions.GamotGenerate,
                PharmacyPermissions.GamotDispense,
                PharmacyPermissions.GamotReverse,
                PharmacyPermissions.StaffRead
            },

            // Prepares and verifies; cannot dispense or reverse.
            [PharmacyStaffRole.PharmacyAssistant] = new[]
            {
                PharmacyPermissions.PrescriptionsRead,
                PharmacyPermissions.InventoryRead,
                PharmacyPermissions.GamotRead,
                PharmacyPermissions.GamotValidate
            },

            // Front counter: looks up prescriptions and GAMOT balances only.
            [PharmacyStaffRole.Cashier] = new[]
            {
                PharmacyPermissions.PrescriptionsRead,
                PharmacyPermissions.GamotRead
            },

            // Stock keeping: view and receive inventory batches only.
            [PharmacyStaffRole.InventoryClerk] = new[]
            {
                PharmacyPermissions.InventoryRead,
                PharmacyPermissions.InventoryReceive
            }
        };

    public static IReadOnlyList<string> For(PharmacyStaffRole role) =>
        Map.TryGetValue(role, out var permissions) ? permissions : Array.Empty<string>();
}