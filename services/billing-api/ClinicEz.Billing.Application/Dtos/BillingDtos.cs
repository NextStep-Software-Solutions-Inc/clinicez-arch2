using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Common;

namespace ClinicEz.Billing.Application.Dtos;

public sealed record InvoiceLineDto(int LineNo, string Code, string Description, int Quantity, decimal UnitPrice, decimal LineTotal);

public sealed record DiscountDto(
    Guid Id, DiscountKind Kind, DiscountMode Mode, decimal Value, decimal Amount, string Reason, string? IdNumber,
    string AppliedByName, string? ApprovedByName, DateTime AppliedAtUtc);

public sealed record InvoiceDto(
    Guid Id,
    string FacilityId,
    FacilityType FacilityType,
    string? BranchId,
    string InvoiceNumber,
    InvoiceOrigin Origin,
    Guid? InvoiceRequestId,
    string SourceType,
    Guid SourceId,
    Guid? PatientId,
    string PatientName,
    string? VisitKey,
    string Currency,
    InvoiceStatus Status,
    decimal Subtotal,
    decimal DiscountTotal,
    decimal Total,
    decimal PaidTotal,
    decimal RefundedTotal,
    decimal Balance,
    DateTime CreatedAtUtc,
    DateTime? PaidAtUtc,
    IReadOnlyList<InvoiceLineDto> Lines,
    IReadOnlyList<DiscountDto> Discounts);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

public sealed record LineRequest(string? Code, string Description, int Quantity, decimal UnitPrice);

public sealed record CreateInvoiceRequest(
    string? BranchId, Guid? PatientId, string PatientName, string? VisitKey, string? SourceType, string? Currency,
    IReadOnlyList<LineRequest> Lines);

public sealed record InvoiceQuery(
    IReadOnlyList<InvoiceStatus>? Statuses, string? FacilityId, string? BranchId, string? VisitKey, string? PatientName,
    DateTime? FromUtc, DateTime? ToUtc, int Page = 1, int PageSize = 25);

public sealed record VisitFacilityDto(string FacilityId, FacilityType FacilityType, decimal Total, decimal Balance);

/// <summary>ONE bill for a visit across the facilities of the cell. <see cref="AnchorInvoiceId"/> addresses the bill in the API.</summary>
public sealed record VisitBillDto(
    Guid AnchorInvoiceId,
    string? VisitKey,
    string? BranchId,
    Guid? PatientId,
    string PatientName,
    string Currency,
    decimal Subtotal,
    decimal DiscountTotal,
    decimal Total,
    decimal Paid,
    decimal Balance,
    IReadOnlyList<VisitFacilityDto> Facilities,
    IReadOnlyList<InvoiceDto> Invoices);

public sealed record VisitBillSummaryDto(
    Guid AnchorInvoiceId,
    string? VisitKey,
    string? BranchId,
    Guid? PatientId,
    string PatientName,
    string Currency,
    int InvoiceCount,
    IReadOnlyList<FacilityType> FacilityTypes,
    decimal Total,
    decimal Balance,
    DateTime OldestAtUtc);

public sealed record ApplyDiscountRequest(DiscountKind Kind, DiscountMode? Mode, decimal? Value, string? Reason, string? IdNumber);

public sealed record VisitDiscountResult(IReadOnlyList<Guid> AppliedInvoiceIds, IReadOnlyList<Guid> SkippedInvoiceIds, VisitBillDto Bill);

public sealed record AllocationRequest(Guid InvoiceId, decimal Amount);

/// <summary>Either <see cref="Allocations"/> (explicit split) or <see cref="AnchorInvoiceId"/> (oldest invoice of that visit bill first).</summary>
public sealed record TakePaymentRequest(
    PaymentMethod Method,
    decimal Amount,
    string? Reference,
    decimal? Tendered,
    InsurerKind? InsurerKind,
    Guid? AnchorInvoiceId,
    IReadOnlyList<AllocationRequest>? Allocations);

public sealed record PaymentAllocationDto(
    Guid InvoiceId, string InvoiceNumber, string FacilityId, FacilityType FacilityType, decimal Amount, InvoiceStatus InvoiceStatus, decimal InvoiceBalance);

public sealed record PaymentDto(
    Guid Id,
    Guid ReceiptId,
    string ReceiptNumber,
    PaymentMethod Method,
    InsurerKind? InsurerKind,
    bool IsExternal,
    string Currency,
    decimal Amount,
    decimal? Tendered,
    decimal Change,
    string? Reference,
    string CashierName,
    DateTime PaidAtUtc,
    IReadOnlyList<PaymentAllocationDto> Allocations,
    bool IsReplay);

public sealed record ReceiptInvoiceDto(
    Guid InvoiceId,
    string InvoiceNumber,
    string FacilityId,
    FacilityType FacilityType,
    string SourceType,
    IReadOnlyList<InvoiceLineDto> Lines,
    decimal Subtotal,
    decimal DiscountTotal,
    decimal Total,
    decimal AppliedByThisPayment,
    decimal BalanceNow);

/// <summary>Everything needed to print the official receipt.</summary>
public sealed record ReceiptDto(
    Guid Id,
    string Number,
    string CounterFacilityId,
    DateTime IssuedAtUtc,
    string PatientName,
    string Currency,
    PaymentMethod Method,
    InsurerKind? InsurerKind,
    bool IsExternal,
    string? Reference,
    decimal Amount,
    decimal? Tendered,
    decimal Change,
    string CashierName,
    IReadOnlyList<ReceiptInvoiceDto> Invoices,
    decimal BalanceRemaining);

public sealed record VoidRequest(string Reason);

public sealed record RefundRequest(string Reason, PaymentMethod? Method);

public sealed record RefundDto(Guid Id, Guid InvoiceId, decimal Amount, PaymentMethod Method, string Reason, string ApprovedByName, DateTime RefundedAtUtc);

public sealed record OpenShiftRequest(decimal OpeningFloat);

public sealed record CloseShiftRequest(decimal CountedCash, string? Notes);

public sealed record ShiftDto(
    Guid Id,
    string FacilityId,
    Guid CashierUserId,
    string CashierName,
    ShiftStatus Status,
    DateTime OpenedAtUtc,
    decimal OpeningFloat,
    DateTime? ClosedAtUtc,
    decimal CashCollected,
    decimal CashRefunded,
    decimal NonCashCollected,
    decimal ExternalSettled,
    decimal ExpectedCash,
    decimal? CountedCash,
    decimal? Variance,
    string? CloseNotes);

public sealed record CollectionBucket(string Key, int Count, decimal Amount, decimal ExternalAmount, decimal Refunded)
{
    public decimal Net => Amount - Refunded;
}

public sealed record CollectionDay(DateOnly Date, int Count, decimal Collected, decimal ExternalSettled, decimal Refunded)
{
    public decimal Net => Collected - Refunded;
}

public sealed record DailyCollectionQuery(
    DateOnly From, DateOnly To, int UtcOffsetMinutes, string Currency, string? FacilityId, string? BranchId, Guid? CashierUserId);

public sealed record DailyCollectionReport(
    DateOnly From,
    DateOnly To,
    int UtcOffsetMinutes,
    string Currency,
    int ReceiptCount,
    decimal Collected,
    decimal ExternalSettled,
    decimal Refunded,
    decimal Net,
    IReadOnlyList<CollectionDay> Days,
    IReadOnlyList<CollectionBucket> ByMethod,
    IReadOnlyList<CollectionBucket> ByCashier,
    IReadOnlyList<CollectionBucket> ByBranch,
    IReadOnlyList<CollectionBucket> ByFacility);

public sealed record AuditEntryDto(Guid Id, DateTime AtUtc, string ActorName, string Action, string EntityType, Guid EntityId, string Details);

public static class InvoiceMapper
{
    public static InvoiceDto ToDto(Invoice i) => new(
        i.Id, i.FacilityId, i.FacilityType, i.BranchId, i.InvoiceNumber, i.Origin, i.InvoiceRequestId, i.SourceType, i.SourceId,
        i.PatientId, i.PatientName, i.VisitKey, i.Currency, i.Status, i.Subtotal, i.DiscountTotal, i.Total, i.PaidTotal,
        i.RefundedTotal, i.Balance, i.CreatedAtUtc, i.PaidAtUtc,
        i.Lines.OrderBy(l => l.LineNo).Select(ToDto).ToList(),
        i.Discounts.OrderBy(d => d.Position).Select(ToDto).ToList());

    public static InvoiceLineDto ToDto(InvoiceLine l) => new(l.LineNo, l.Code, l.Description, l.Quantity, l.UnitPrice, l.LineTotal);

    public static DiscountDto ToDto(InvoiceDiscount d) => new(
        d.Id, d.Kind, d.Mode, d.Value, d.Amount, d.Reason, d.IdNumber, d.AppliedByName, d.ApprovedByName, d.AppliedAtUtc);
}
