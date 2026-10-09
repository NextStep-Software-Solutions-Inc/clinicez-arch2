using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Billing.Domain.Entities;

public sealed record InvoiceLineInput(string Code, string Description, int Quantity, decimal UnitPrice);

/// <summary>
/// One facility's charge for a patient. Invoices of the same visit (tenant + branch + visit key + patient) are shown and
/// collected together as a visit bill, but each stays the ledger record of the facility that issued it.
/// Lines and discounts can only change while nothing has been paid; after the first payment the invoice is locked.
/// </summary>
public class Invoice
{
    public const int MaxLines = 200;
    public const decimal MaxUnitPrice = 100_000_000m;
    public const decimal StatutoryDiscountPercent = 20m;

    private Invoice()
    {
    }

    public Guid Id { get; private set; }
    public string TenantId { get; private set; } = string.Empty;
    /// <summary>The facility that issued (and owns the ledger record of) this invoice.</summary>
    public string FacilityId { get; private set; } = string.Empty;
    public FacilityType FacilityType { get; private set; }
    public string? BranchId { get; private set; }
    public InvoiceOrigin Origin { get; private set; }
    /// <summary>Idempotency + correlation key chosen by the requesting facility; <c>null</c> for walk-in invoices.</summary>
    public Guid? InvoiceRequestId { get; private set; }
    public string SourceType { get; private set; } = string.Empty;
    public Guid SourceId { get; private set; }
    public string InvoiceNumber { get; private set; } = string.Empty;
    public Guid? PatientId { get; private set; }
    public string PatientName { get; private set; } = string.Empty;
    public string? VisitKey { get; private set; }
    public string Currency { get; private set; } = Money.DefaultCurrency;
    public InvoiceStatus Status { get; private set; }
    public decimal Subtotal { get; private set; }
    public decimal DiscountTotal { get; private set; }
    public decimal Total { get; private set; }
    public decimal PaidTotal { get; private set; }
    public decimal RefundedTotal { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }
    public DateTime? PaidAtUtc { get; private set; }
    public DateTime? VoidedAtUtc { get; private set; }
    public string? VoidReason { get; private set; }
    public string CreatedBy { get; private set; } = string.Empty;
    /// <summary>Optimistic concurrency token: two cashiers cannot pay the same invoice at the same time.</summary>
    public int Version { get; private set; }

    public List<InvoiceLine> Lines { get; private set; } = new();
    public List<InvoiceDiscount> Discounts { get; private set; } = new();

    public decimal NetPaid => PaidTotal - RefundedTotal;

    public decimal Balance => Status is InvoiceStatus.Open or InvoiceStatus.PartiallyPaid ? Total - NetPaid : 0m;

    /// <summary>
    /// Lines and discounts are frozen once money is held against the invoice (net of refunds), or the invoice was closed.
    /// A reopened invoice whose earlier payments were refunded holds nothing, so it is editable again.
    /// </summary>
    public bool IsLocked => Status != InvoiceStatus.Open || NetPaid > 0m;

    public static Invoice Create(
        string tenantId,
        string facilityId,
        FacilityType facilityType,
        string? branchId,
        InvoiceOrigin origin,
        Guid? invoiceRequestId,
        string sourceType,
        Guid sourceId,
        Guid? patientId,
        string patientName,
        string? visitKey,
        string? currency,
        IEnumerable<InvoiceLineInput> lines,
        string createdBy,
        DateTime nowUtc)
    {
        if (string.IsNullOrWhiteSpace(tenantId)) throw new BadRequestException("Tenant is required.");
        if (string.IsNullOrWhiteSpace(facilityId)) throw new BadRequestException("Facility is required.");
        var currencyCode = ValidateDetails(patientName, sourceType, currency);

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Trim(),
            FacilityId = facilityId.Trim(),
            FacilityType = facilityType,
            Origin = origin,
            InvoiceRequestId = invoiceRequestId,
            Status = InvoiceStatus.Open,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
            CreatedBy = createdBy
        };
        invoice.Lines.AddRange(invoice.BuildLines(lines));
        invoice.ApplyDetails(branchId, sourceType, sourceId, patientId, patientName, visitKey, currencyCode);
        invoice.Recalculate();
        return invoice;
    }

    /// <summary>Gives a freshly created invoice its per-counter number (done after validation so rejected requests burn no number).</summary>
    public void AssignNumber(string invoiceNumber)
    {
        if (!string.IsNullOrEmpty(InvoiceNumber)) throw new InvalidOperationException("The invoice already has a number.");
        InvoiceNumber = invoiceNumber;
    }

    /// <summary>Replaces the request details and lines (a re-sent <c>billing.invoice.requested</c>). Only while unpaid.</summary>
    public void ReplaceRequest(
        string? branchId,
        string sourceType,
        Guid sourceId,
        Guid? patientId,
        string patientName,
        string? visitKey,
        string? currency,
        IEnumerable<InvoiceLineInput> lines,
        DateTime nowUtc)
    {
        EnsureUnlocked();
        var currencyCode = ValidateDetails(patientName, sourceType, currency);
        var built = BuildLines(lines);

        ApplyDetails(branchId, sourceType, sourceId, patientId, patientName, visitKey, currencyCode);
        Lines.Clear();
        Lines.AddRange(built);
        Recalculate();
        Touch(nowUtc);
    }

    /// <summary>
    /// A new <c>billing.invoice.requested</c> for an invoice that was voided or fully refunded brings the same invoice back to
    /// Open with the new lines and total. Payments and refunds stay on record; only money still held (<see cref="NetPaid"/>, zero
    /// after a refund) counts against the new total. Discounts of the old charge do not carry over.
    /// </summary>
    public void Reopen(
        string? branchId,
        string sourceType,
        Guid sourceId,
        Guid? patientId,
        string patientName,
        string? visitKey,
        string? currency,
        IEnumerable<InvoiceLineInput> lines,
        DateTime nowUtc)
    {
        if (Origin != InvoiceOrigin.Requested) throw new ConflictException($"Invoice {InvoiceNumber} was not requested by a facility and cannot be reopened.");
        if (Status is not (InvoiceStatus.Void or InvoiceStatus.Refunded))
            throw new ConflictException($"Invoice {InvoiceNumber} is {Status} and cannot be reopened.");

        var currencyCode = ValidateDetails(patientName, sourceType, currency);
        var built = BuildLines(lines);

        ApplyDetails(branchId, sourceType, sourceId, patientId, patientName, visitKey, currencyCode);
        Lines.Clear();
        Lines.AddRange(built);
        Discounts.Clear();
        Status = InvoiceStatus.Open;
        PaidAtUtc = null;
        VoidedAtUtc = null;
        VoidReason = null;
        Recalculate();
        Touch(nowUtc);
    }

    /// <summary>An invoice with nothing to collect (every line free) is settled on arrival.</summary>
    public void SettleWithoutCharge(DateTime nowUtc)
    {
        if (Total != 0m) throw new ConflictException($"Invoice {InvoiceNumber} has an amount due and cannot be settled without payment.");
        if (Status != InvoiceStatus.Open) return;
        Status = InvoiceStatus.Paid;
        PaidAtUtc = nowUtc;
        Touch(nowUtc);
    }

    public InvoiceDiscount ApplyDiscount(
        DiscountKind kind,
        DiscountMode? mode,
        decimal? value,
        string? reason,
        string? idNumber,
        Guid actorId,
        string actorName,
        Guid? approverId,
        string? approverName,
        DateTime nowUtc)
    {
        EnsureUnlocked();

        var statutory = kind is DiscountKind.Senior or DiscountKind.Pwd;
        if (statutory)
        {
            if (mode is not null && mode != DiscountMode.Percentage || value is not null && value != StatutoryDiscountPercent)
                throw new BadRequestException($"Senior citizen and PWD discounts are a fixed {StatutoryDiscountPercent:0}% (RA 9994 / RA 10754).");
            if (string.IsNullOrWhiteSpace(idNumber))
                throw new BadRequestException("The senior citizen / PWD ID number is required for a statutory discount.");
            if (Discounts.Any(d => d.Kind is DiscountKind.Senior or DiscountKind.Pwd))
                throw new ConflictException("A senior citizen or PWD discount is already applied; the two cannot be combined.");
            mode = DiscountMode.Percentage;
            value = StatutoryDiscountPercent;
            reason = string.IsNullOrWhiteSpace(reason)
                ? kind == DiscountKind.Senior ? "Senior citizen discount (RA 9994)" : "PWD discount (RA 10754)"
                : reason;
        }
        else
        {
            if (approverId is null || string.IsNullOrWhiteSpace(approverName))
                throw new ForbiddenException("Promo and other discounts need a supervisor's approval.");
            if (string.IsNullOrWhiteSpace(reason)) throw new BadRequestException("A reason is required for this discount.");
            if (mode is null || value is null) throw new BadRequestException("Discount mode and value are required.");
        }

        var discountMode = mode!.Value;
        var discountValue = value!.Value;
        if (discountMode == DiscountMode.Percentage && (discountValue <= 0m || discountValue > 100m))
            throw new BadRequestException("A percentage discount must be above 0 and at most 100.");
        if (discountMode == DiscountMode.Fixed && (discountValue < 0.01m || Money.Round(discountValue) != discountValue))
            throw new BadRequestException("A fixed discount must be a positive amount with at most two decimals.");

        var discount = new InvoiceDiscount
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            InvoiceId = Id,
            Position = Discounts.Count == 0 ? 1 : Discounts.Max(d => d.Position) + 1,
            Kind = kind,
            Mode = discountMode,
            Value = discountValue,
            Reason = reason!.Trim(),
            IdNumber = string.IsNullOrWhiteSpace(idNumber) ? null : idNumber.Trim(),
            AppliedByUserId = actorId,
            AppliedByName = actorName,
            ApprovedByUserId = statutory ? null : approverId,
            ApprovedByName = statutory ? null : approverName,
            AppliedAtUtc = nowUtc
        };
        Discounts.Add(discount);

        var requested = discountMode == DiscountMode.Percentage ? Money.Round(Subtotal * discountValue / 100m) : discountValue;
        Recalculate();
        if (discount.Amount != requested)
        {
            Discounts.Remove(discount);
            Recalculate();
            throw new BadRequestException("The discount would cover the entire invoice; waive it by voiding the invoice instead.");
        }

        Touch(nowUtc);
        return discount;
    }

    /// <summary>Books a payment allocation against this invoice and moves it to PartiallyPaid / Paid.</summary>
    public void RegisterPayment(decimal amount, DateTime nowUtc)
    {
        if (Status is not (InvoiceStatus.Open or InvoiceStatus.PartiallyPaid))
            throw new ConflictException($"Invoice {InvoiceNumber} is {Status} and cannot take a payment.");
        if (amount < 0.01m || Money.Round(amount) != amount)
            throw new BadRequestException("A payment amount must be positive with at most two decimals.");
        if (amount > Balance)
            throw new BadRequestException($"The amount {amount:0.00} is more than the balance {Balance:0.00} of invoice {InvoiceNumber}.");

        PaidTotal += amount;
        if (NetPaid >= Total)
        {
            Status = InvoiceStatus.Paid;
            PaidAtUtc = nowUtc;
        }
        else
        {
            Status = InvoiceStatus.PartiallyPaid;
        }

        Touch(nowUtc);
    }

    /// <summary>Cancels an invoice nothing was paid on.</summary>
    public void Void(string reason, DateTime nowUtc)
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new BadRequestException("A reason is required to void an invoice.");
        if (NetPaid > 0m) throw new ConflictException($"Invoice {InvoiceNumber} has payments; refund it instead of voiding.");
        if (Status != InvoiceStatus.Open) throw new ConflictException($"Invoice {InvoiceNumber} is {Status} and cannot be voided.");

        Status = InvoiceStatus.Void;
        VoidedAtUtc = nowUtc;
        VoidReason = reason.Trim();
        Touch(nowUtc);
    }

    /// <summary>
    /// Gives back <paramref name="amount"/> of the money held on the invoice (all of it when <c>null</c>). Refunding everything closes
    /// the invoice as <see cref="InvoiceStatus.Refunded"/>; refunding less leaves it <see cref="InvoiceStatus.PartiallyRefunded"/>, which
    /// is still settled and locked and can be refunded further. A partly paid invoice can only be refunded in full. Returns the amount.
    /// </summary>
    public decimal Refund(decimal? amount, string reason, DateTime nowUtc)
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new BadRequestException("A reason is required to refund an invoice.");
        if (Status is not (InvoiceStatus.PartiallyPaid or InvoiceStatus.Paid or InvoiceStatus.PartiallyRefunded) || NetPaid <= 0m)
            throw new ConflictException($"Invoice {InvoiceNumber} has no payment to refund.");

        var refunded = amount ?? NetPaid;
        if (refunded < 0.01m || Money.Round(refunded) != refunded)
            throw new BadRequestException("A refund amount must be positive with at most two decimals.");
        if (refunded > NetPaid)
            throw new BadRequestException($"The amount {refunded:0.00} is more than the {NetPaid:0.00} still held on invoice {InvoiceNumber}.");
        if (refunded < NetPaid && Status == InvoiceStatus.PartiallyPaid)
            throw new ConflictException($"Invoice {InvoiceNumber} is only partly paid; refund it in full.");

        RefundedTotal += refunded;
        if (NetPaid == 0m)
        {
            Status = InvoiceStatus.Refunded;
            VoidedAtUtc = nowUtc;
            VoidReason = reason.Trim();
        }
        else
        {
            Status = InvoiceStatus.PartiallyRefunded;
        }

        Touch(nowUtc);
        return refunded;
    }

    private void EnsureUnlocked()
    {
        if (IsLocked) throw new ConflictException($"Invoice {InvoiceNumber} is {Status} and can no longer be changed.");
    }

    private void Touch(DateTime nowUtc)
    {
        UpdatedAtUtc = nowUtc;
        Version++;
    }

    private static string ValidateDetails(string patientName, string sourceType, string? currency)
    {
        if (string.IsNullOrWhiteSpace(patientName)) throw new BadRequestException("The patient name is required.");
        if (string.IsNullOrWhiteSpace(sourceType)) throw new BadRequestException("The source type is required.");
        var code = string.IsNullOrWhiteSpace(currency) ? Money.DefaultCurrency : currency.Trim().ToUpperInvariant();
        if (code.Length != 3) throw new BadRequestException("The currency must be a 3-letter ISO code.");
        return code;
    }

    private void ApplyDetails(string? branchId, string sourceType, Guid sourceId, Guid? patientId, string patientName, string? visitKey, string currency)
    {
        BranchId = Clean(branchId, 100);
        SourceType = Clean(sourceType, 64)!;
        SourceId = sourceId;
        PatientId = patientId;
        PatientName = Clean(patientName, 255)!;
        VisitKey = Clean(visitKey, 100);
        Currency = currency;
    }

    private List<InvoiceLine> BuildLines(IEnumerable<InvoiceLineInput> lines)
    {
        var list = lines.ToList();
        if (list.Count == 0) throw new BadRequestException("An invoice needs at least one line.");
        if (list.Count > MaxLines) throw new BadRequestException($"An invoice can have at most {MaxLines} lines.");

        var built = new List<InvoiceLine>(list.Count);
        foreach (var (input, index) in list.Select((l, i) => (l, i)))
        {
            if (string.IsNullOrWhiteSpace(input.Description)) throw new BadRequestException($"Line {index + 1} needs a description.");
            if (input.Quantity < 1 || input.Quantity > 10_000) throw new BadRequestException($"Line {index + 1} quantity must be between 1 and 10000.");
            if (input.UnitPrice < 0m || input.UnitPrice > MaxUnitPrice) throw new BadRequestException($"Line {index + 1} has an invalid unit price.");

            built.Add(new InvoiceLine
            {
                Id = Guid.NewGuid(),
                TenantId = TenantId,
                InvoiceId = Id,
                LineNo = index + 1,
                Code = Clean(input.Code, 64) ?? string.Empty,
                Description = Clean(input.Description, 255)!,
                Quantity = input.Quantity,
                UnitPrice = Money.Round(input.UnitPrice)
            });
        }

        return built;
    }

    private void Recalculate()
    {
        foreach (var line in Lines) line.LineTotal = Money.Round(line.Quantity * line.UnitPrice);
        Subtotal = Lines.Sum(l => l.LineTotal);

        // Discounts are computed on the gross subtotal independently (no compounding) and are capped so that at
        // least one centavo stays payable: the invoice is never silently "free".
        var ceiling = Subtotal > 0m ? Subtotal - 0.01m : 0m;
        var running = 0m;
        foreach (var discount in Discounts.OrderBy(d => d.Position))
        {
            var raw = discount.Mode == DiscountMode.Percentage ? Money.Round(Subtotal * discount.Value / 100m) : discount.Value;
            discount.Amount = Math.Min(raw, Math.Max(0m, ceiling - running));
            running += discount.Amount;
        }

        DiscountTotal = running;
        Total = Subtotal - DiscountTotal;
    }

    private static string? Clean(string? value, int max)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}

public class InvoiceLine
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public Guid InvoiceId { get; set; }
    public int LineNo { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal LineTotal { get; set; }
}

public class InvoiceDiscount
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public Guid InvoiceId { get; set; }
    public int Position { get; set; }
    public DiscountKind Kind { get; set; }
    public DiscountMode Mode { get; set; }
    /// <summary>Percent (0-100) or fixed amount, depending on <see cref="Mode"/>.</summary>
    public decimal Value { get; set; }
    /// <summary>Computed peso amount of this discount on the current subtotal.</summary>
    public decimal Amount { get; set; }
    public string Reason { get; set; } = string.Empty;
    /// <summary>Senior citizen / PWD ID number for statutory discounts.</summary>
    public string? IdNumber { get; set; }
    public Guid AppliedByUserId { get; set; }
    public string AppliedByName { get; set; } = string.Empty;
    public Guid? ApprovedByUserId { get; set; }
    public string? ApprovedByName { get; set; }
    public DateTime AppliedAtUtc { get; set; }
}
