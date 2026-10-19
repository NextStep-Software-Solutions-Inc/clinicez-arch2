using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands.RecordManualPayment;
using ClinicEz.Portal.Application.Features.Billing.Queries;
using ClinicEz.Portal.Application.Features.Billing.Services;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Licensing;
using FluentValidation.TestHelper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Portal.Tests.Features.Admin;

public class RecordManualPaymentCommandHandlerTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly RecordManualPaymentCommandHandler _handler;
    private readonly IDocumentNumberGenerator _documentNumbers;
    private readonly ISubscriptionService _subscriptions;
    private readonly IEntitlementService _entitlements;
    private readonly RecordManualPaymentCommandValidator _validator = new();

    public RecordManualPaymentCommandHandlerTests()
    {
        _documentNumbers = new DocumentNumberGenerator(_context);
        _entitlements = TestSupport.Entitlements(_context);

        var publisher = new EntitlementsPublisher(
            _context,
            _entitlements,
            new FacilityAllocationService(_context),
            new LicenseIssuer(new FacilityLicenseSigner(), Options.Create(new LicenseOptions()), TimeProvider.System),
            new InteropPublisher(_context));

        _subscriptions = new SubscriptionService(
            _context,
            Options.Create(TestSupport.Plans()),
            TimeProvider.System,
            publisher);

        _handler = new RecordManualPaymentCommandHandler(
            _context,
            _subscriptions,
            _documentNumbers,
            TimeProvider.System,
            NullLogger<RecordManualPaymentCommandHandler>.Instance);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private async Task<(Tenant Tenant, Facility Facility)> SeedTenantWithFacilityAsync(string slug = "apollo-health")
    {
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Name = slug,
            TenantSlug = slug,
            Email = $"{slug}@clinic.test",
            OwnerId = $"owner-{slug}"
        };
        _context.Tenants.Add(tenant);

        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Name = $"{slug}-clinic",
            Slug = $"{slug}-clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            DeploymentMode = FacilityDeploymentMode.SharedCloud
        };
        _context.Facilities.Add(facility);

        await _context.SaveChangesAsync();
        return (tenant, facility);
    }

    [Fact]
    public async Task Handle_BankTransfer_CreatesInvoiceAndReceipt_ActivatesSubscription_AndStagesLicenses()
    {
        var (tenant, facility) = await SeedTenantWithFacilityAsync("st-luke-bgc");

        var paymentDate = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc);
        var command = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "starter",
            IsAnnual: true,
            PaymentMethod: "Bank Transfer",
            TransactionReference: "BDO-982141",
            Amount: 29990.00m,
            Notes: "Paid via BDO online transfer",
            PaymentDate: paymentDate,
            RecordedBy: "SuperAdmin"
        );

        var result = await _handler.Handle(command, CancellationToken.None);

        Assert.NotNull(result);
        Assert.True(result.Success);
        Assert.Equal("INV-202610-0001", result.InvoiceNumber);
        Assert.Equal("REC-202610-0001", result.ReceiptNumber);
        Assert.Equal("Active", result.Status);
        Assert.Equal(paymentDate.AddYears(1), result.SubscriptionExpiresAt);
        Assert.True(result.EntitlementVersion >= 1);
        Assert.Equal(1, result.FacilitiesLicensed);

        // Verify BillingInvoice in database
        var invoice = await _context.BillingInvoices.SingleAsync(i => i.InvoiceNumber == "INV-202610-0001");
        Assert.Equal(tenant.Id, invoice.TenantId);
        Assert.Equal("Paid", invoice.Status);
        Assert.Equal(29990.00m, invoice.Amount);
        Assert.Equal("PHP", invoice.Currency);
        Assert.Equal("starter", invoice.PlanSlug);
        Assert.True(invoice.IsAnnual);
        Assert.StartsWith("MANUAL-INV-202610-0001-", invoice.XenditInvoiceId);

        // Verify PaymentReceipt in database
        var receipt = await _context.PaymentReceipts.SingleAsync(r => r.ReceiptNumber == "REC-202610-0001");
        Assert.Equal(tenant.Id, receipt.TenantId);
        Assert.Equal(invoice.Id, receipt.InvoiceId);
        Assert.Equal(29990.00m, receipt.AmountPaid);
        Assert.Equal("PHP", receipt.Currency);
        Assert.Equal("Bank Transfer", receipt.PaymentMethod);
        Assert.Equal("BDO-982141", receipt.TransactionReference);
        Assert.Equal("Paid via BDO online transfer", receipt.Notes);
        Assert.Equal(paymentDate, receipt.PaidAt);
        Assert.Equal(paymentDate.AddYears(1), receipt.ExpiryDate);

        // Verify Subscription updated
        var subscription = await _context.Subscriptions.Include(s => s.Plan).SingleAsync(s => s.TenantId == tenant.Id);
        Assert.Equal(SubscriptionStatus.Active, subscription.Status);
        Assert.Equal("Manual", subscription.ProviderName);
        Assert.Equal("starter", subscription.Plan.Slug);
        Assert.True(subscription.IsAnnual);

        // Verify facility licenses staged
        var reloadedFacility = await _context.Facilities.SingleAsync(f => f.Id == facility.Id);
        Assert.NotNull(reloadedFacility.LicenseToken);
        Assert.NotNull(reloadedFacility.LicenseExpiresAt);

        // Verify InteropOutbox received entitlements.changed envelope
        var outboxMessages = await _context.InteropOutbox.ToListAsync();
        Assert.NotEmpty(outboxMessages);
        Assert.Contains(outboxMessages, m => m.Type == InteropTypes.EntitlementsChanged);
    }

    [Fact]
    public async Task Handle_GCashAndCash_Success()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("metro-doc");

        // 1. GCash payment
        var gcashCommand = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: "GCash",
            TransactionReference: "GCASH-98231",
            Amount: 2990.00m,
            Notes: "GCash reference confirmed"
        );
        var gcashResult = await _handler.Handle(gcashCommand, CancellationToken.None);
        Assert.NotNull(gcashResult);
        Assert.True(gcashResult.Success);
        Assert.Equal("Active", gcashResult.Status);

        // 2. Cash payment
        var cashCommand = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: "Cash",
            TransactionReference: null,
            Amount: 2990.00m,
            Notes: "Received at central office"
        );
        var cashResult = await _handler.Handle(cashCommand, CancellationToken.None);
        Assert.NotNull(cashResult);
        Assert.True(cashResult.Success);
    }

    [Fact]
    public async Task Handle_PromotionalPayment_ZeroAmount_Success()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("promo-clinic");

        var command = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: "Promotional",
            TransactionReference: null,
            Amount: 0m,
            Notes: "Free voucher promo activation"
        );

        var result = await _handler.Handle(command, CancellationToken.None);

        Assert.NotNull(result);
        Assert.True(result.Success);
        Assert.Equal("Active", result.Status);

        var receipt = await _context.PaymentReceipts.SingleAsync(r => r.TenantId == tenant.Id);
        Assert.Equal(0m, receipt.AmountPaid);
        Assert.Equal("Promotional", receipt.PaymentMethod);
        Assert.Null(receipt.TransactionReference);
        Assert.Equal("Free voucher promo activation", receipt.Notes);
    }

    [Fact]
    public async Task Handle_SequentialNumbering_IncrementsDeterministically()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("sequential-clinic");
        var dateOct = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc);
        var dateNov = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);

        // 1. First October payment
        var cmd1 = new RecordManualPaymentCommand(tenant.Id, "starter", false, "Cash", null, 1000m, null, dateOct);
        var res1 = await _handler.Handle(cmd1, CancellationToken.None);
        Assert.Equal("INV-202610-0001", res1!.InvoiceNumber);
        Assert.Equal("REC-202610-0001", res1.ReceiptNumber);

        // 2. Second October payment
        var cmd2 = new RecordManualPaymentCommand(tenant.Id, "starter", false, "Cash", null, 1000m, null, dateOct);
        var res2 = await _handler.Handle(cmd2, CancellationToken.None);
        Assert.Equal("INV-202610-0002", res2!.InvoiceNumber);
        Assert.Equal("REC-202610-0002", res2.ReceiptNumber);

        // 3. First November payment (resets counter for the new month)
        var cmd3 = new RecordManualPaymentCommand(tenant.Id, "starter", false, "Cash", null, 1000m, null, dateNov);
        var res3 = await _handler.Handle(cmd3, CancellationToken.None);
        Assert.Equal("INV-202611-0001", res3!.InvoiceNumber);
        Assert.Equal("REC-202611-0001", res3.ReceiptNumber);
    }

    [Fact]
    public async Task Handle_SyntheticXenditInvoiceId_PreventsCollisions()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("collision-test");

        var cmd1 = new RecordManualPaymentCommand(tenant.Id, "starter", false, "Cash", null, 1000m, null);
        var res1 = await _handler.Handle(cmd1, CancellationToken.None);

        var cmd2 = new RecordManualPaymentCommand(tenant.Id, "starter", false, "Cash", null, 1000m, null);
        var res2 = await _handler.Handle(cmd2, CancellationToken.None);

        var invoices = await _context.BillingInvoices.Where(i => i.TenantId == tenant.Id).ToListAsync();
        Assert.Equal(2, invoices.Count);
        Assert.NotEqual(invoices[0].XenditInvoiceId, invoices[1].XenditInvoiceId);
        Assert.StartsWith("MANUAL-", invoices[0].XenditInvoiceId);
        Assert.StartsWith("MANUAL-", invoices[1].XenditInvoiceId);
    }

    [Fact]
    public async Task Handle_TenantNotFound_ReturnsNull()
    {
        var command = new RecordManualPaymentCommand(
            TenantId: Guid.NewGuid(),
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: "Cash",
            TransactionReference: null,
            Amount: 1000m,
            Notes: null
        );

        var result = await _handler.Handle(command, CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task Handle_PlanNotFound_ReturnsNull()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("no-plan-clinic");

        var command = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "non-existent-plan",
            IsAnnual: false,
            PaymentMethod: "Cash",
            TransactionReference: null,
            Amount: 1000m,
            Notes: null
        );

        var result = await _handler.Handle(command, CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public void Validator_RejectsNegativeAmount()
    {
        var command = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Bank Transfer", "REF-123", -10m, null);

        var result = _validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.Amount);
    }

    [Fact]
    public void Validator_RejectsZeroAmount_ForNonPromotional()
    {
        var command = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Bank Transfer", "REF-123", 0m, null);

        var result = _validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.Amount);
    }

    [Fact]
    public void Validator_AllowsZeroAmount_ForPromotional()
    {
        var command = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Promotional", null, 0m, "Voucher");

        var result = _validator.TestValidate(command);
        result.ShouldNotHaveValidationErrorFor(x => x.Amount);
    }

    [Fact]
    public void Validator_RejectsMissingReference_ForBankTransfer()
    {
        var command = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Bank Transfer", null, 1000m, null);

        var result = _validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.TransactionReference);
    }

    [Fact]
    public void Validator_AllowsMissingReference_ForCashAndPromotional()
    {
        var cashCommand = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Cash", null, 1000m, null);
        var cashResult = _validator.TestValidate(cashCommand);
        cashResult.ShouldNotHaveValidationErrorFor(x => x.TransactionReference);

        var promoCommand = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Promotional", null, 0m, null);
        var promoResult = _validator.TestValidate(promoCommand);
        promoResult.ShouldNotHaveValidationErrorFor(x => x.TransactionReference);
    }

    [Fact]
    public void Validator_RejectsInvalidPaymentMethod()
    {
        var command = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Bitcoin", "TX-123", 1000m, null);

        var result = _validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.PaymentMethod);
    }

    [Fact]
    public async Task GetBillingInfoQuery_ReflectsManualPaymentReceiptDetails()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("billing-query-test");

        var command = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "starter",
            IsAnnual: true,
            PaymentMethod: "Bank Transfer",
            TransactionReference: "BDO-982141",
            Amount: 29990.00m,
            Notes: "Paid via BDO online transfer",
            PaymentDate: new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc)
        );
        await _handler.Handle(command, CancellationToken.None);

        var queryHandler = new GetBillingInfoQueryHandler(_context, _entitlements);
        var billingInfo = await queryHandler.Handle(new GetBillingInfoQuery(tenant.Id.ToString()), CancellationToken.None);

        Assert.NotNull(billingInfo);
        Assert.Single(billingInfo.Invoices);

        var invoice = billingInfo.Invoices[0];
        Assert.Equal("INV-202610-0001", invoice.InvoiceNumber);
        Assert.Equal("Paid", invoice.Status);
        Assert.NotNull(invoice.Receipt);
        Assert.Equal("REC-202610-0001", invoice.Receipt.ReceiptNumber);
        Assert.Equal(29990.00m, invoice.Receipt.AmountPaid);
        Assert.Equal("PHP", invoice.Receipt.Currency);
        Assert.Equal("Bank Transfer", invoice.Receipt.PaymentMethod);
        Assert.Equal("BDO-982141", invoice.Receipt.TransactionReference);
        Assert.Equal("Paid via BDO online transfer", invoice.Receipt.Notes);
    }
}
