using ClinicEz.Billing.Domain.Enums;

namespace ClinicEz.Billing.Domain.Constants;

public static class BillingPermissions
{
    public const string InvoicesRead = "invoices:read";
    public const string InvoicesCreate = "invoices:create";
    /// <summary>Statutory (senior / PWD) discounts.</summary>
    public const string DiscountsApply = "discounts:apply";
    /// <summary>Promo / other discounts, voids and refunds: supervisor actions.</summary>
    public const string Approvals = "billing:approve";
    public const string PaymentsTake = "payments:take";
    public const string ShiftsManage = "shifts:manage";
    public const string ReportsRead = "reports:read";
    public const string StaffManage = "staff:manage";

    public static readonly IReadOnlyList<string> All = new[]
    {
        InvoicesRead, InvoicesCreate, DiscountsApply, Approvals, PaymentsTake, ShiftsManage, ReportsRead, StaffManage
    };

    /// <summary>The trusted internal-service principal (portal / provisioning) may only manage staff accounts.</summary>
    public static readonly IReadOnlyList<string> InternalService = new[] { StaffManage };
}

public static class BillingRolePermissions
{
    private static readonly string[] Cashier =
    {
        BillingPermissions.InvoicesRead, BillingPermissions.InvoicesCreate, BillingPermissions.DiscountsApply,
        BillingPermissions.PaymentsTake, BillingPermissions.ShiftsManage
    };

    private static readonly string[] Supervisor =
        Cashier.Concat(new[] { BillingPermissions.Approvals, BillingPermissions.ReportsRead }).ToArray();

    public static IReadOnlyList<string> For(StaffRole role) => role switch
    {
        StaffRole.Cashier => Cashier,
        StaffRole.Supervisor => Supervisor,
        StaffRole.Admin => BillingPermissions.All,
        _ => Array.Empty<string>()
    };
}
