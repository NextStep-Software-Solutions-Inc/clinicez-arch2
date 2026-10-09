using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Billing.Domain.Entities;

/// <summary>A cashier's drawer session: opening float, what the system expects at close, what was counted, and the variance.</summary>
public class CashierShift
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public Guid CashierUserId { get; set; }
    public string CashierName { get; set; } = string.Empty;
    public ShiftStatus Status { get; set; }
    public DateTime OpenedAtUtc { get; set; }
    public decimal OpeningFloat { get; set; }
    public DateTime? ClosedAtUtc { get; set; }
    public decimal? CashCollected { get; set; }
    public decimal? CashRefunded { get; set; }
    public decimal? NonCashCollected { get; set; }
    public decimal? ExternalSettled { get; set; }
    /// <summary><c>OpeningFloat + CashCollected - CashRefunded</c>.</summary>
    public decimal? ExpectedCash { get; set; }
    public decimal? CountedCash { get; set; }
    /// <summary><c>CountedCash - ExpectedCash</c>: negative is a shortage, positive an overage.</summary>
    public decimal? Variance { get; set; }
    public string? CloseNotes { get; set; }

    public static CashierShift Open(string tenantId, string facilityId, Guid cashierUserId, string cashierName, decimal openingFloat, DateTime nowUtc)
    {
        if (openingFloat < 0m || Money.Round(openingFloat) != openingFloat)
            throw new BadRequestException("The opening float must be zero or more, with at most two decimals.");

        return new CashierShift
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            CashierUserId = cashierUserId,
            CashierName = cashierName,
            Status = ShiftStatus.Open,
            OpenedAtUtc = nowUtc,
            OpeningFloat = openingFloat
        };
    }

    /// <summary>
    /// Closes the drawer. A shortage or overage must be explained in <paramref name="notes"/>; the variance is stored, never hidden.
    /// </summary>
    public void Close(decimal countedCash, decimal cashCollected, decimal cashRefunded, decimal nonCashCollected, decimal externalSettled, string? notes, DateTime nowUtc)
    {
        if (Status != ShiftStatus.Open) throw new ConflictException("This shift is already closed.");
        if (countedCash < 0m || Money.Round(countedCash) != countedCash)
            throw new BadRequestException("The counted cash must be zero or more, with at most two decimals.");

        var expected = OpeningFloat + cashCollected - cashRefunded;
        var variance = countedCash - expected;
        if (variance != 0m && string.IsNullOrWhiteSpace(notes))
            throw new BadRequestException($"The drawer is off by {variance:0.00}; explain the variance in the close notes.");

        Status = ShiftStatus.Closed;
        ClosedAtUtc = nowUtc;
        CashCollected = cashCollected;
        CashRefunded = cashRefunded;
        NonCashCollected = nonCashCollected;
        ExternalSettled = externalSettled;
        ExpectedCash = expected;
        CountedCash = countedCash;
        Variance = variance;
        CloseNotes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
    }
}

/// <summary>Append-only record of who did what. Never updated or deleted (enforced by the DbContext).</summary>
public class AuditEntry
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string? FacilityId { get; set; }
    public DateTime AtUtc { get; set; }
    public Guid? ActorUserId { get; set; }
    public string ActorName { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public Guid EntityId { get; set; }
    public string Details { get; set; } = string.Empty;
}

/// <summary>A facility whose invoices this billing-api serves (learned from the messages that arrive through this cell's hub).</summary>
public class BillingFacility
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public ClinicEz.Shared.Common.FacilityType FacilityType { get; set; }
    public DateTime FirstSeenUtc { get; set; }
    public DateTime LastSeenUtc { get; set; }
    /// <summary>The signed license the control plane issued for this facility (<c>facility.license.issued</c> / <c>entitlements.changed</c>); <c>null</c> until one arrives. Only facilities holding one are license-gated.</summary>
    public string? LicenseToken { get; set; }
    /// <summary>Workspace entitlement version of <see cref="LicenseToken"/>; a replacement license older than this is ignored.</summary>
    public int EntitlementVersion { get; set; }
    public string? PlanTier { get; set; }
    public DateTime? LicenseExpiresAt { get; set; }
}

/// <summary>Gap-free per-counter document numbers (receipts, invoices). Concurrent writers collide on <see cref="Version"/> and retry.</summary>
public class DocumentSequence
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public int LastValue { get; set; }
    public int Version { get; set; }
}

public class BillingStaff
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    /// <summary>The counter (facility) the user works at; receipts and shifts are booked against it.</summary>
    public string FacilityId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public StaffRole Role { get; set; }
    public bool IsActive { get; set; } = true;
    public int TokenVersion { get; set; }
    public int FailedLoginCount { get; set; }
    public DateTime? LockoutEnd { get; set; }
    public DateTime? LastLoginAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
