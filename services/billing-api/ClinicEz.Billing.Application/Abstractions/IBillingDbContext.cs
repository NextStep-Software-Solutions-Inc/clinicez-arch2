using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Application.Abstractions;

/// <summary>The billing database as the application layer sees it. Implemented by the Infrastructure <c>ApplicationDbContext</c>.</summary>
public interface IBillingDbContext : IInteropDbContext
{
    DbSet<Invoice> Invoices { get; }
    DbSet<Payment> Payments { get; }
    DbSet<PaymentAllocation> PaymentAllocations { get; }
    DbSet<Receipt> Receipts { get; }
    DbSet<Refund> Refunds { get; }
    DbSet<RefundLine> RefundLines { get; }
    DbSet<CashierShift> CashierShifts { get; }
    DbSet<AuditEntry> AuditEntries { get; }
    DbSet<BillingFacility> BillingFacilities { get; }
    DbSet<DocumentSequence> DocumentSequences { get; }
}

/// <summary>The authenticated cashier a request runs as. Tenant, counter facility, user and role come ONLY from the validated token.</summary>
public sealed record BillingCaller(
    string TenantId,
    string FacilityId,
    Guid UserId,
    string UserName,
    StaffRole Role,
    IReadOnlyCollection<string> Permissions)
{
    public bool Has(string permission) => Permissions.Contains(permission, StringComparer.OrdinalIgnoreCase);
}

public interface IBillingContext
{
    /// <summary>Tenant of the authenticated session (<c>null</c> outside an HTTP request: handlers scope explicitly).</summary>
    string? TenantId { get; }

    /// <summary>The signed-in cashier; throws <c>ForbiddenException</c> for anonymous, internal-service or malformed principals.</summary>
    BillingCaller RequireStaff();

    /// <summary>The signed-in cashier, or <c>null</c> for the internal-service principal and anonymous requests.</summary>
    BillingCaller? TryGetStaff();

    /// <summary>Whether the current principal (staff role permissions, or the narrow internal-service set) holds the permission.</summary>
    bool HasPermission(string permission);
}

