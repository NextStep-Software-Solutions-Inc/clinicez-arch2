using ClinicEz.Portal.Application.Features.Finance;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Finance;

public class FinanceRollupTests : IDisposable
{
    private static readonly DateTime PaidAt = new(2026, 5, 10, 9, 30, 0, DateTimeKind.Utc);

    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Tenant _tenant = new() { Id = Guid.NewGuid(), TenantSlug = "metro", Name = "Metro", OwnerId = "owner", Email = "o@metro.ph" };
    private readonly Guid _branchId = Guid.NewGuid();
    private readonly Facility _clinic;
    private readonly Facility _pharmacy;

    public FinanceRollupTests()
    {
        _clinic = new Facility { Id = Guid.NewGuid(), TenantId = _tenant.Id, Name = "Clinic", FacilityType = FacilityType.Clinic, BranchId = _branchId };
        _pharmacy = new Facility { Id = Guid.NewGuid(), TenantId = _tenant.Id, Name = "Pharmacy", FacilityType = FacilityType.Pharmacy };
        _context.Tenants.Add(_tenant);
        _context.Branches.Add(new Branch { Id = _branchId, TenantId = _tenant.Id, Name = "Main Branch" });
        _context.Facilities.AddRange(_clinic, _pharmacy);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private Party Billing(Facility facility) =>
        Party.ForFacility(_tenant.Id.ToString(), facility.Id.ToString(), facility.FacilityType, InteropServices.Billing);

    private static InteropMessageContext Context(Party from, string type) =>
        new(InteropEnvelope.Create(type, from, Party.Portal, Guid.NewGuid(), new object()));

    private BillingInvoicePaidPayload Paid(Facility facility, Guid invoiceId, decimal total, string source = "Consultation", DateTime? paidAt = null, string currency = "PHP") =>
        new()
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = facility.Id.ToString(),
            FacilityType = facility.FacilityType,
            BranchId = facility.BranchId?.ToString(),
            InvoiceId = invoiceId,
            SourceType = source,
            Total = total,
            Currency = currency,
            PaidAtUtc = paidAt ?? PaidAt
        };

    private BillingInvoiceVoidedPayload Voided(Facility facility, Guid invoiceId, decimal reversed, bool wasPaid = true, string source = "Consultation") =>
        new()
        {
            TenantId = _tenant.Id.ToString(),
            FacilityId = facility.Id.ToString(),
            FacilityType = facility.FacilityType,
            BranchId = facility.BranchId?.ToString(),
            InvoiceId = invoiceId,
            SourceType = source,
            Kind = wasPaid ? BillingCorrectionKind.Refund : BillingCorrectionKind.Void,
            Total = reversed,
            AmountReversed = reversed,
            WasFullyPaid = wasPaid,
            CorrectedAtUtc = PaidAt.AddDays(2)
        };

    private BillingInvoicePaidHandler PaidHandler() => new(_context, NullLogger<BillingInvoicePaidHandler>.Instance);

    private BillingInvoiceVoidedHandler VoidedHandler() => new(_context, NullLogger<BillingInvoiceVoidedHandler>.Instance);

    private Task ReportPaid(Facility facility, BillingInvoicePaidPayload payload, Party? sender = null) =>
        PaidHandler().HandleAsync(payload, Context(sender ?? Billing(facility), InteropTypes.BillingInvoicePaid), CancellationToken.None);

    private Task ReportVoided(Facility facility, BillingInvoiceVoidedPayload payload, Party? sender = null) =>
        VoidedHandler().HandleAsync(payload, Context(sender ?? Billing(facility), InteropTypes.BillingInvoiceVoided), CancellationToken.None);

    [Fact]
    public async Task Paid_AddsToTheDailySummaryOfTheFacility_AndRemembersTheInvoice()
    {
        var invoice = Guid.NewGuid();

        await ReportPaid(_clinic, Paid(_clinic, invoice, 1250.50m));

        var summary = await _context.FinanceDailySummaries.SingleAsync();
        Assert.Equal(_tenant.Id, summary.TenantId);
        Assert.Equal(_clinic.Id, summary.FacilityId);
        Assert.Equal(_branchId, summary.BranchId);
        Assert.Equal(new DateOnly(2026, 5, 10), summary.Day);
        Assert.Equal("Consultation", summary.SourceType);
        Assert.Equal(1250.50m, summary.TotalPaid);
        Assert.Equal(1, summary.PaidInvoiceCount);
        var record = await _context.FinanceInvoiceRecords.SingleAsync();
        Assert.Equal(invoice, record.InvoiceId);
        Assert.Equal(1250.50m, record.PaidAmount);
    }

    [Fact]
    public async Task Paid_Redelivered_IsCountedOnce()
    {
        var invoice = Guid.NewGuid();

        await ReportPaid(_clinic, Paid(_clinic, invoice, 500m));
        await ReportPaid(_clinic, Paid(_clinic, invoice, 500m));

        Assert.Equal(500m, (await _context.FinanceDailySummaries.SingleAsync()).TotalPaid);
        Assert.Single(_context.FinanceInvoiceRecords);
    }

    [Fact]
    public async Task Paid_SeveralInvoicesOfADay_SumIntoOneRowPerFacilitySourceAndCurrency()
    {
        await ReportPaid(_clinic, Paid(_clinic, Guid.NewGuid(), 100m));
        await ReportPaid(_clinic, Paid(_clinic, Guid.NewGuid(), 200m, paidAt: PaidAt.AddHours(3)));
        await ReportPaid(_clinic, Paid(_clinic, Guid.NewGuid(), 50m, source: "Laboratory"));
        await ReportPaid(_clinic, Paid(_clinic, Guid.NewGuid(), 10m, currency: "usd"));
        await ReportPaid(_clinic, Paid(_clinic, Guid.NewGuid(), 70m, paidAt: PaidAt.AddDays(1)));

        var rows = await _context.FinanceDailySummaries.ToListAsync();
        Assert.Equal(4, rows.Count);
        var consultation = rows.Single(r => r.SourceType == "Consultation" && r.Currency == "PHP" && r.Day == new DateOnly(2026, 5, 10));
        Assert.Equal(300m, consultation.TotalPaid);
        Assert.Equal(2, consultation.PaidInvoiceCount);
        Assert.Contains(rows, r => r.Currency == "USD");
    }

    [Fact]
    public async Task Paid_FromAnyoneButTheFacilitysBillingService_IsDropped()
    {
        var payload = Paid(_clinic, Guid.NewGuid(), 999m);
        var otherFacilityBilling = Billing(_pharmacy);
        var clinicNotBilling = Party.ForFacility(_tenant.Id.ToString(), _clinic.Id.ToString(), FacilityType.Clinic, InteropServices.Clinic);
        var otherTenantBilling = Party.ForFacility(Guid.NewGuid().ToString(), _clinic.Id.ToString(), FacilityType.Clinic, InteropServices.Billing);

        await ReportPaid(_clinic, payload, otherFacilityBilling);
        await ReportPaid(_clinic, payload, clinicNotBilling);
        await ReportPaid(_clinic, payload, otherTenantBilling);
        await ReportPaid(_clinic, payload, Party.Portal);

        Assert.Empty(_context.FinanceDailySummaries);
        Assert.Empty(_context.FinanceInvoiceRecords);
    }

    [Fact]
    public async Task Paid_ForAnUnknownFacilityOrMalformedIds_IsDropped()
    {
        var unknown = new Facility { Id = Guid.NewGuid(), TenantId = _tenant.Id, FacilityType = FacilityType.Clinic };
        await ReportPaid(unknown, Paid(unknown, Guid.NewGuid(), 10m));
        var malformed = Paid(_clinic, Guid.NewGuid(), 10m) with { TenantId = "not-a-guid" };
        await ReportPaid(_clinic, malformed);

        Assert.Empty(_context.FinanceDailySummaries);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public async Task Paid_WithANonPositiveTotal_IsIgnored(double total)
    {
        await ReportPaid(_clinic, Paid(_clinic, Guid.NewGuid(), (decimal)total));

        Assert.Empty(_context.FinanceDailySummaries);
    }

    [Fact]
    public async Task Voided_AfterPaid_ReversesTheAmountOnTheDayItWasCounted_AndOnlyOnce()
    {
        var invoice = Guid.NewGuid();
        await ReportPaid(_clinic, Paid(_clinic, invoice, 400m));

        await ReportVoided(_clinic, Voided(_clinic, invoice, 400m));
        await ReportVoided(_clinic, Voided(_clinic, invoice, 400m));

        var summary = await _context.FinanceDailySummaries.SingleAsync();
        Assert.Equal(new DateOnly(2026, 5, 10), summary.Day);
        Assert.Equal(400m, summary.TotalPaid);
        Assert.Equal(400m, summary.TotalReversed);
        Assert.Equal(1, summary.ReversedInvoiceCount);
        var record = await _context.FinanceInvoiceRecords.SingleAsync();
        Assert.True(record.Reversed);
        Assert.Equal(400m, record.ReversedAmount);
    }

    private BillingInvoiceVoidedPayload PartialRefund(Facility facility, Guid invoiceId, decimal total, decimal thisRefund, decimal refundedTotal) =>
        Voided(facility, invoiceId, thisRefund) with { Total = total, IsPartial = true, RefundedTotal = refundedTotal };

    [Fact]
    public async Task PartialRefund_ReversesOnlyTheDelta_AndLeavesTheInvoiceOpen()
    {
        var invoice = Guid.NewGuid();
        await ReportPaid(_clinic, Paid(_clinic, invoice, 400m));

        await ReportVoided(_clinic, PartialRefund(_clinic, invoice, 400m, 100m, 100m));
        await ReportVoided(_clinic, PartialRefund(_clinic, invoice, 400m, 100m, 100m));
        await ReportVoided(_clinic, PartialRefund(_clinic, invoice, 400m, 50m, 150m));

        var summary = await _context.FinanceDailySummaries.SingleAsync();
        Assert.Equal(150m, summary.TotalReversed);
        Assert.Equal(1, summary.ReversedInvoiceCount);
        var record = await _context.FinanceInvoiceRecords.SingleAsync();
        Assert.Equal(150m, record.ReversedAmount);
        Assert.False(record.Reversed);
    }

    [Fact]
    public async Task PartialRefund_ReachingThePaidAmount_ClosesTheInvoice_AndLaterCorrectionsChangeNothing()
    {
        var invoice = Guid.NewGuid();
        await ReportPaid(_clinic, Paid(_clinic, invoice, 400m));
        await ReportVoided(_clinic, PartialRefund(_clinic, invoice, 400m, 100m, 100m));

        await ReportVoided(_clinic, PartialRefund(_clinic, invoice, 400m, 300m, 400m));
        await ReportVoided(_clinic, PartialRefund(_clinic, invoice, 400m, 500m, 900m));
        await ReportVoided(_clinic, PartialRefund(_clinic, invoice, 400m, 100m, 100m));

        Assert.Equal(400m, (await _context.FinanceDailySummaries.SingleAsync()).TotalReversed);
        var record = await _context.FinanceInvoiceRecords.SingleAsync();
        Assert.Equal(400m, record.ReversedAmount);
        Assert.True(record.Reversed);
    }

    [Fact]
    public async Task PartialRefund_ArrivingOutOfOrder_NeverTakesBackLess()
    {
        var invoice = Guid.NewGuid();
        await ReportPaid(_clinic, Paid(_clinic, invoice, 400m));

        await ReportVoided(_clinic, PartialRefund(_clinic, invoice, 400m, 50m, 150m));
        await ReportVoided(_clinic, PartialRefund(_clinic, invoice, 400m, 100m, 100m));

        Assert.Equal(150m, (await _context.FinanceDailySummaries.SingleAsync()).TotalReversed);
    }

    [Fact]
    public async Task PartialRefund_BeforeThePaymentReport_CountsThePaymentOnce_AndTheRefundOnce()
    {
        var invoice = Guid.NewGuid();

        await ReportVoided(_clinic, PartialRefund(_clinic, invoice, 400m, 100m, 100m));
        await ReportPaid(_clinic, Paid(_clinic, invoice, 400m));

        var summary = await _context.FinanceDailySummaries.SingleAsync();
        Assert.Equal(400m, summary.TotalPaid);
        Assert.Equal(1, summary.PaidInvoiceCount);
        Assert.Equal(100m, summary.TotalReversed);
        Assert.False((await _context.FinanceInvoiceRecords.SingleAsync()).Reversed);
    }

    [Fact]
    public async Task Voided_CannotReverseMoreThanWasPaid()
    {
        var invoice = Guid.NewGuid();
        await ReportPaid(_clinic, Paid(_clinic, invoice, 300m));

        await ReportVoided(_clinic, Voided(_clinic, invoice, 900m));

        Assert.Equal(300m, (await _context.FinanceDailySummaries.SingleAsync()).TotalReversed);
    }

    [Fact]
    public async Task Voided_OfAnInvoiceThatWasNeverPaid_ChangesNothing()
    {
        await ReportVoided(_clinic, Voided(_clinic, Guid.NewGuid(), 0m, wasPaid: false));

        Assert.Empty(_context.FinanceDailySummaries);
        Assert.Empty(_context.FinanceInvoiceRecords);
    }

    [Fact]
    public async Task Voided_BeforeThePaymentReport_StopsTheLatePaymentFromBeingCounted()
    {
        var invoice = Guid.NewGuid();

        await ReportVoided(_clinic, Voided(_clinic, invoice, 250m));
        await ReportPaid(_clinic, Paid(_clinic, invoice, 250m));

        Assert.Empty(_context.FinanceDailySummaries);
        var record = await _context.FinanceInvoiceRecords.SingleAsync();
        Assert.True(record.Reversed);
    }

    [Fact]
    public async Task Voided_FromTheWrongSender_IsDropped()
    {
        var invoice = Guid.NewGuid();
        await ReportPaid(_clinic, Paid(_clinic, invoice, 400m));

        await ReportVoided(_clinic, Voided(_clinic, invoice, 400m), Billing(_pharmacy));

        Assert.Equal(0m, (await _context.FinanceDailySummaries.SingleAsync()).TotalReversed);
    }

    [Fact]
    public async Task Summary_TotalsByFacilityBranchSourceAndDay_NetOfReversals()
    {
        var refunded = Guid.NewGuid();
        await ReportPaid(_clinic, Paid(_clinic, refunded, 400m));
        await ReportPaid(_clinic, Paid(_clinic, Guid.NewGuid(), 600m, paidAt: PaidAt.AddDays(1)));
        await ReportPaid(_pharmacy, Paid(_pharmacy, Guid.NewGuid(), 150m, source: "Pharmacy"));
        await ReportVoided(_clinic, Voided(_clinic, refunded, 400m));
        var handler = new GetFinanceSummaryQueryHandler(_context, new TestClock(new DateTimeOffset(PaidAt.AddDays(5))));

        var summary = await handler.Handle(new GetFinanceSummaryQuery("metro", null, null, null, null), CancellationToken.None);

        var total = Assert.Single(summary.Totals);
        Assert.Equal(new FinanceTotalsDto("PHP", 1150m, 400m, 750m, 3, 1), total);
        Assert.Equal(2, summary.ByFacility.Count);
        Assert.Equal(600m, summary.ByFacility.Single(f => f.FacilityName == "Clinic").Totals.Net);
        Assert.Equal(150m, summary.ByFacility.Single(f => f.FacilityName == "Pharmacy").Totals.Net);
        Assert.Equal("Main Branch", summary.ByBranch.Single(b => b.BranchId == _branchId).BranchName);
        Assert.Contains(summary.ByBranch, b => b.BranchName == "No branch");
        Assert.Equal(["Consultation", "Pharmacy"], summary.BySource.Select(s => s.SourceType));
        Assert.Equal([new DateOnly(2026, 5, 10), new DateOnly(2026, 5, 11)], summary.Daily.Select(d => d.Day).Distinct());
    }

    [Fact]
    public async Task Summary_CanBeNarrowedToOneFacility_AndNeverShowsAnotherWorkspace()
    {
        await ReportPaid(_clinic, Paid(_clinic, Guid.NewGuid(), 100m));
        await ReportPaid(_pharmacy, Paid(_pharmacy, Guid.NewGuid(), 200m, source: "Pharmacy"));
        var other = new Tenant { Id = Guid.NewGuid(), TenantSlug = "other", Name = "Other", OwnerId = "x", Email = "x@o.ph" };
        _context.Tenants.Add(other);
        _context.FinanceDailySummaries.Add(new FinanceDailySummary { Id = Guid.NewGuid(), TenantId = other.Id, FacilityId = Guid.NewGuid(), Day = new DateOnly(2026, 5, 10), SourceType = "x", TotalPaid = 9999m });
        await _context.SaveChangesAsync();
        var handler = new GetFinanceSummaryQueryHandler(_context, new TestClock(new DateTimeOffset(PaidAt)));

        var clinicOnly = await handler.Handle(new GetFinanceSummaryQuery("metro", null, null, _clinic.Id, null), CancellationToken.None);
        var all = await handler.Handle(new GetFinanceSummaryQuery("metro", null, null, null, null), CancellationToken.None);

        Assert.Equal(100m, Assert.Single(clinicOnly.Totals).Net);
        Assert.Equal(300m, Assert.Single(all.Totals).Net);
    }

    [Fact]
    public async Task Summary_RejectsAnInvertedOrOversizedRange_AndUnknownWorkspaces()
    {
        var handler = new GetFinanceSummaryQueryHandler(_context, TimeProvider.System);
        var day = new DateOnly(2026, 5, 10);

        await Assert.ThrowsAsync<BadRequestException>(() => handler.Handle(new GetFinanceSummaryQuery("metro", day, day.AddDays(-1), null, null), CancellationToken.None));
        await Assert.ThrowsAsync<BadRequestException>(() => handler.Handle(new GetFinanceSummaryQuery("metro", day, day.AddDays(400), null, null), CancellationToken.None));
        await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(new GetFinanceSummaryQuery("nope", null, null, null, null), CancellationToken.None));
    }
}
