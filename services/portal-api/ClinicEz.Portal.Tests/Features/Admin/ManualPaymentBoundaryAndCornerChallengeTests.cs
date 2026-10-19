using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Common.Behaviors;
using ClinicEz.Portal.Application.Features.Admin.Commands.RecordManualPayment;
using ClinicEz.Portal.Application.Features.Billing.Queries;
using ClinicEz.Portal.Application.Features.Billing.Services;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Licensing;
using FluentValidation.TestHelper;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Portal.Tests.Features.Admin;

/// <summary>
/// Empirical challenge tests stress-testing boundary and corner cases for
/// Manual Payment Recording, Validation, License Activation, and Billing Info Query Reflection.
/// </summary>
public class ManualPaymentBoundaryAndCornerChallengeTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly RecordManualPaymentCommandHandler _handler;
    private readonly IDocumentNumberGenerator _documentNumbers;
    private readonly ISubscriptionService _subscriptions;
    private readonly IEntitlementService _entitlements;
    private readonly RecordManualPaymentCommandValidator _validator = new();
    private readonly ValidationBehavior<RecordManualPaymentCommand, RecordManualPaymentResult?> _validationBehavior;

    public ManualPaymentBoundaryAndCornerChallengeTests()
    {
        _documentNumbers = new DocumentNumberGenerator(_context);
        _entitlements = TestSupport.Entitlements(_context);

        var publisher = new EntitlementsPublisher(
            _context,
            _entitlements,
            new FacilityAllocationService(_context),
            new LicenseIssuer(new FacilityLicenseSigner(), Options.Create(new LicenseOptions()), TimeProvider.System),
            new ClinicEz.Shared.Interop.InteropPublisher(_context));

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

        _validationBehavior = new ValidationBehavior<RecordManualPaymentCommand, RecordManualPaymentResult?>([_validator]);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private async Task<(Tenant Tenant, Facility Facility)> SeedTenantWithFacilityAsync(string slug = "corner-health")
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

    // =========================================================================
    // 1. Promotional 0.00 payment succeeds with valid paid invoice and receipt
    // =========================================================================

    [Fact]
    public async Task Boundary_PromotionalZeroAmountPayment_Succeeds_WithValidPaidInvoiceAndReceipt()
    {
        var (tenant, facility) = await SeedTenantWithFacilityAsync("promo-boundary-clinic");
        var paymentDate = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc);

        var command = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: "Promotional",
            TransactionReference: null,
            Amount: 0.00m,
            Notes: "Complimentary incubator pilot grant",
            PaymentDate: paymentDate,
            RecordedBy: "AdminChallenger"
        );

        var result = await _handler.Handle(command, CancellationToken.None);

        Assert.NotNull(result);
        Assert.True(result.Success);
        Assert.Equal("Active", result.Status);
        Assert.StartsWith("INV-202610-", result.InvoiceNumber);
        Assert.StartsWith("REC-202610-", result.ReceiptNumber);
        Assert.Equal(paymentDate.AddMonths(1), result.SubscriptionExpiresAt);
        Assert.Equal(1, result.FacilitiesLicensed);

        // Verify BillingInvoice in database: Status is Paid, Amount is 0.00, Currency is PHP
        var invoice = await _context.BillingInvoices.SingleAsync(i => i.InvoiceNumber == result.InvoiceNumber);
        Assert.Equal(tenant.Id, invoice.TenantId);
        Assert.Equal("Paid", invoice.Status);
        Assert.Equal(0.00m, invoice.Amount);
        Assert.Equal("PHP", invoice.Currency);
        Assert.Equal("starter", invoice.PlanSlug);
        Assert.False(invoice.IsAnnual);
        Assert.StartsWith($"MANUAL-{result.InvoiceNumber}-", invoice.XenditInvoiceId);

        // Verify PaymentReceipt in database: AmountPaid is 0.00, Currency is PHP, Method is Promotional
        var receipt = await _context.PaymentReceipts.SingleAsync(r => r.ReceiptNumber == result.ReceiptNumber);
        Assert.Equal(tenant.Id, receipt.TenantId);
        Assert.Equal(invoice.Id, receipt.InvoiceId);
        Assert.Equal(0.00m, receipt.AmountPaid);
        Assert.Equal("PHP", receipt.Currency);
        Assert.Equal("Promotional", receipt.PaymentMethod);
        Assert.Null(receipt.TransactionReference);
        Assert.Equal("Complimentary incubator pilot grant", receipt.Notes);
        Assert.Equal(paymentDate, receipt.PaidAt);
        Assert.Equal(paymentDate.AddMonths(1), receipt.ExpiryDate);

        // Verify subscription is Active and licenses staged
        var subscription = await _context.Subscriptions.SingleAsync(s => s.TenantId == tenant.Id);
        Assert.Equal(SubscriptionStatus.Active, subscription.Status);
        Assert.Equal("Manual", subscription.ProviderName);

        var reloadedFacility = await _context.Facilities.SingleAsync(f => f.Id == facility.Id);
        Assert.NotNull(reloadedFacility.LicenseToken);
        Assert.NotNull(reloadedFacility.LicenseExpiresAt);
    }

    [Fact]
    public async Task Boundary_PromotionalPayment_AnnualInterval_SetsOneYearExpiry()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("promo-annual-clinic");
        var paymentDate = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc);

        var command = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "starter",
            IsAnnual: true,
            PaymentMethod: "Promotional",
            TransactionReference: null,
            Amount: 0.00m,
            Notes: "Full year scholarship program",
            PaymentDate: paymentDate,
            RecordedBy: "AdminChallenger"
        );

        var result = await _handler.Handle(command, CancellationToken.None);

        Assert.NotNull(result);
        Assert.True(result.Success);
        Assert.Equal(paymentDate.AddYears(1), result.SubscriptionExpiresAt);

        var receipt = await _context.PaymentReceipts.SingleAsync(r => r.ReceiptNumber == result.ReceiptNumber);
        Assert.Equal(paymentDate.AddYears(1), receipt.ExpiryDate);
    }

    // =========================================================================
    // 2. Negative amount rejected
    // =========================================================================

    [Theory]
    [InlineData(-100.00)]
    [InlineData(-0.01)]
    [InlineData(-999999.99)]
    public void Validation_RejectsNegativeAmount(decimal negativeAmount)
    {
        var command = new RecordManualPaymentCommand(
            TenantId: Guid.NewGuid(),
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: "Bank Transfer",
            TransactionReference: "TX-12345",
            Amount: negativeAmount,
            Notes: "Negative test"
        );

        var result = _validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.Amount)
              .WithErrorMessage("Amount must be greater than or equal to 0.");
    }

    // =========================================================================
    // 3. Non-promotional 0.00 rejected
    // =========================================================================

    [Theory]
    [InlineData("Bank Transfer")]
    [InlineData("GCash")]
    [InlineData("Maya")]
    [InlineData("GCash/Maya")]
    [InlineData("Cash")]
    [InlineData("Check")]
    public void Validation_RejectsZeroAmount_ForNonPromotionalMethods(string paymentMethod)
    {
        var command = new RecordManualPaymentCommand(
            TenantId: Guid.NewGuid(),
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: paymentMethod,
            TransactionReference: paymentMethod == "Cash" ? null : "REF-VALID",
            Amount: 0.00m,
            Notes: "Non-promotional zero amount should fail"
        );

        var result = _validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.Amount)
              .WithErrorMessage("Amount must be greater than 0 for non-promotional payments.");
    }

    [Theory]
    [InlineData("Bank Transfer")]
    [InlineData("GCash")]
    [InlineData("Maya")]
    [InlineData("GCash/Maya")]
    [InlineData("Cash")]
    [InlineData("Check")]
    public void Validation_AllowsSmallestPositiveAmount_ForNonPromotionalMethods(string paymentMethod)
    {
        var command = new RecordManualPaymentCommand(
            TenantId: Guid.NewGuid(),
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: paymentMethod,
            TransactionReference: paymentMethod == "Cash" ? null : "REF-VALID",
            Amount: 0.01m,
            Notes: "Smallest positive amount"
        );

        var result = _validator.TestValidate(command);
        result.ShouldNotHaveValidationErrorFor(x => x.Amount);
    }

    // =========================================================================
    // 4. Missing reference on Bank Transfer / GCash / Maya / Check rejected
    // =========================================================================

    [Theory]
    [InlineData("Bank Transfer", null)]
    [InlineData("Bank Transfer", "")]
    [InlineData("Bank Transfer", "   ")]
    [InlineData("GCash", null)]
    [InlineData("GCash", "")]
    [InlineData("GCash", "   ")]
    [InlineData("Maya", null)]
    [InlineData("Maya", "")]
    [InlineData("Maya", "   ")]
    [InlineData("GCash/Maya", null)]
    [InlineData("GCash/Maya", "")]
    [InlineData("GCash/Maya", "   ")]
    [InlineData("Check", null)]
    [InlineData("Check", "")]
    [InlineData("Check", "   ")]
    public void Validation_RejectsMissingOrWhitespaceReference_ForReferenceRequiredMethods(string paymentMethod, string? reference)
    {
        var command = new RecordManualPaymentCommand(
            TenantId: Guid.NewGuid(),
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: paymentMethod,
            TransactionReference: reference,
            Amount: 2500.00m,
            Notes: "Testing required reference"
        );

        var result = _validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.TransactionReference)
              .WithErrorMessage("Transaction reference is required for non-cash/non-promotional payments.");
    }

    [Theory]
    [InlineData("Cash", null)]
    [InlineData("Cash", "")]
    [InlineData("Promotional", null)]
    [InlineData("Promotional", "")]
    public void Validation_AllowsNullOrEmptyReference_ForCashAndPromotional(string paymentMethod, string? reference)
    {
        var command = new RecordManualPaymentCommand(
            TenantId: Guid.NewGuid(),
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: paymentMethod,
            TransactionReference: reference,
            Amount: paymentMethod == "Promotional" ? 0m : 1500m,
            Notes: "Cash or promo reference is optional"
        );

        var result = _validator.TestValidate(command);
        result.ShouldNotHaveValidationErrorFor(x => x.TransactionReference);
    }

    // =========================================================================
    // 5. Length bounds rejected (256 for reference, 2000 for notes)
    // =========================================================================

    [Fact]
    public void Validation_LengthBounds_TransactionReference_Accepts256_Rejects257()
    {
        var validRef = new string('A', 256);
        var invalidRef = new string('A', 257);

        // 256 chars -> Should succeed
        var validCommand = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Bank Transfer", validRef, 5000m, null);
        var validResult = _validator.TestValidate(validCommand);
        validResult.ShouldNotHaveValidationErrorFor(x => x.TransactionReference);

        // 257 chars -> Should fail validation
        var invalidCommand = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Bank Transfer", invalidRef, 5000m, null);
        var invalidResult = _validator.TestValidate(invalidCommand);
        invalidResult.ShouldHaveValidationErrorFor(x => x.TransactionReference)
                     .WithErrorMessage("TransactionReference cannot exceed 256 characters.");
    }

    [Fact]
    public void Validation_LengthBounds_Notes_Accepts2000_Rejects2001()
    {
        var validNotes = new string('N', 2000);
        var invalidNotes = new string('N', 2001);

        // 2000 chars -> Should succeed
        var validCommand = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Cash", null, 5000m, validNotes);
        var validResult = _validator.TestValidate(validCommand);
        validResult.ShouldNotHaveValidationErrorFor(x => x.Notes);

        // 2001 chars -> Should fail validation
        var invalidCommand = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Cash", null, 5000m, invalidNotes);
        var invalidResult = _validator.TestValidate(invalidCommand);
        invalidResult.ShouldHaveValidationErrorFor(x => x.Notes)
                     .WithErrorMessage("Notes cannot exceed 2000 characters.");
    }

    // =========================================================================
    // 6. Unknown / Invalid payment methods rejected
    // =========================================================================

    [Theory]
    [InlineData("Bitcoin")]
    [InlineData("Ethereum")]
    [InlineData("CreditCard")]
    [InlineData("Stripe")]
    [InlineData("PayPal")]
    [InlineData("")]
    public void Validation_RejectsDisallowedPaymentMethods(string invalidMethod)
    {
        var command = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, invalidMethod, "TX-REF-1", 1000m, null);

        var result = _validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.PaymentMethod);
    }

    // =========================================================================
    // 7. Nonexistent tenant or nonexistent plan returns null (clean 404)
    // =========================================================================

    [Fact]
    public async Task Boundary_NonexistentTenant_ReturnsNull()
    {
        var nonexistentTenantId = Guid.NewGuid();
        var command = new RecordManualPaymentCommand(
            TenantId: nonexistentTenantId,
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
    public async Task Boundary_NonexistentPlan_ReturnsNull()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("ghost-plan-tenant");

        var command = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "plan-that-does-not-exist",
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
    public async Task Boundary_PlanSlugWithWhitespaceAndMixedCase_ResolvesPlanSuccessfully()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("slug-case-tenant");

        var command = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "   StArTeR   ",
            IsAnnual: false,
            PaymentMethod: "Cash",
            TransactionReference: null,
            Amount: 1000m,
            Notes: "Plan slug normalization test"
        );

        var result = await _handler.Handle(command, CancellationToken.None);
        Assert.NotNull(result);
        Assert.True(result.Success);

        var invoice = await _context.BillingInvoices.SingleAsync(i => i.InvoiceNumber == result.InvoiceNumber);
        Assert.Equal("starter", invoice.PlanSlug);
    }

    [Fact]
    public void EndpointMapping_WhenResultIsNull_ProducesNotFound404()
    {
        // Simulates the endpoint mapping logic in AdminEndpoints.cs:
        // var result = await sender.Send(command);
        // return result != null ? Results.Ok(result) : Results.NotFound("Tenant or Plan not found");
        RecordManualPaymentResult? nullResult = null;
        var endpointResult = nullResult != null 
            ? Results.Ok(nullResult) 
            : Results.NotFound("Tenant or Plan not found");

        var notFoundResult = Assert.IsType<NotFound<string>>(endpointResult);
        Assert.Equal(StatusCodes.Status404NotFound, notFoundResult.StatusCode);
        Assert.Equal("Tenant or Plan not found", notFoundResult.Value);
    }

    // =========================================================================
    // 8. ValidationBehavior Pipeline Tests (Clean ValidationException)
    // =========================================================================

    [Fact]
    public async Task ValidationBehavior_ThrowsValidationException_WhenAmountIsNegative()
    {
        var command = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Bank Transfer", "REF-123", -100.00m, "Testing negative amount");

        var ex = await Assert.ThrowsAsync<ClinicEz.Shared.Exceptions.ValidationException>(() =>
            _validationBehavior.Handle(command, _ => Task.FromResult<RecordManualPaymentResult?>(null), CancellationToken.None));

        Assert.NotNull(ex.Errors);
        Assert.True(ex.Errors!.ContainsKey("Amount"));
        Assert.Contains(ex.Errors!["Amount"], msg => msg.Contains("greater than or equal to 0"));
    }

    [Fact]
    public async Task ValidationBehavior_ThrowsValidationException_WhenNonPromotionalAmountIsZero()
    {
        var command = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Bank Transfer", "REF-123", 0.00m, "Testing zero amount for bank transfer");

        var ex = await Assert.ThrowsAsync<ClinicEz.Shared.Exceptions.ValidationException>(() =>
            _validationBehavior.Handle(command, _ => Task.FromResult<RecordManualPaymentResult?>(null), CancellationToken.None));

        Assert.NotNull(ex.Errors);
        Assert.True(ex.Errors!.ContainsKey("Amount"));
        Assert.Contains(ex.Errors!["Amount"], msg => msg.Contains("greater than 0 for non-promotional"));
    }

    [Fact]
    public async Task ValidationBehavior_ThrowsValidationException_WhenMissingReferenceForBankTransfer()
    {
        var command = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Bank Transfer", null, 5000.00m, "Testing missing reference");

        var ex = await Assert.ThrowsAsync<ClinicEz.Shared.Exceptions.ValidationException>(() =>
            _validationBehavior.Handle(command, _ => Task.FromResult<RecordManualPaymentResult?>(null), CancellationToken.None));

        Assert.NotNull(ex.Errors);
        Assert.True(ex.Errors!.ContainsKey("TransactionReference"));
        Assert.Contains(ex.Errors!["TransactionReference"], msg => msg.Contains("Transaction reference is required"));
    }

    [Fact]
    public async Task ValidationBehavior_ThrowsValidationException_WhenReferenceExceeds256Chars()
    {
        var longRef = new string('X', 257);
        var command = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Bank Transfer", longRef, 5000.00m, null);

        var ex = await Assert.ThrowsAsync<ClinicEz.Shared.Exceptions.ValidationException>(() =>
            _validationBehavior.Handle(command, _ => Task.FromResult<RecordManualPaymentResult?>(null), CancellationToken.None));

        Assert.NotNull(ex.Errors);
        Assert.True(ex.Errors!.ContainsKey("TransactionReference"));
        Assert.Contains(ex.Errors!["TransactionReference"], msg => msg.Contains("cannot exceed 256 characters"));
    }

    [Fact]
    public async Task ValidationBehavior_ThrowsValidationException_WhenNotesExceed2000Chars()
    {
        var longNotes = new string('N', 2001);
        var command = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Cash", null, 5000.00m, longNotes);

        var ex = await Assert.ThrowsAsync<ClinicEz.Shared.Exceptions.ValidationException>(() =>
            _validationBehavior.Handle(command, _ => Task.FromResult<RecordManualPaymentResult?>(null), CancellationToken.None));

        Assert.NotNull(ex.Errors);
        Assert.True(ex.Errors!.ContainsKey("Notes"));
        Assert.Contains(ex.Errors!["Notes"], msg => msg.Contains("cannot exceed 2000 characters"));
    }

    [Fact]
    public async Task ValidationBehavior_ProceedsToHandler_WhenPromotionalAmountIsZeroAndReferenceIsNull()
    {
        var command = new RecordManualPaymentCommand(
            Guid.NewGuid(), "starter", false, "Promotional", null, 0.00m, "Valid promotional command");

        var wasInvoked = false;
        var dummyResult = new RecordManualPaymentResult(true, "INV-1", "REC-1", "Active", DateTime.UtcNow, 1, 1);

        var result = await _validationBehavior.Handle(command, _ =>
        {
            wasInvoked = true;
            return Task.FromResult<RecordManualPaymentResult?>(dummyResult);
        }, CancellationToken.None);

        Assert.True(wasInvoked);
        Assert.NotNull(result);
        Assert.True(result.Success);
    }

    // =========================================================================
    // 9. Query reflection: GetBillingInfoQuery returns Currency, TransactionReference, Notes
    // =========================================================================

    [Fact]
    public async Task QueryReflection_GetBillingInfoQuery_ByTenantId_ReturnsCurrencyTransactionReferenceNotes()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("query-reflection-clinic");
        var paymentDate = new DateTime(2026, 10, 15, 8, 30, 0, DateTimeKind.Utc);
        const string expectedRef = "BDO-ONLINE-9876543210";
        const string expectedNotes = "Payment verified via BDO online corporate portal by Treasurer";

        var command = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "starter",
            IsAnnual: true,
            PaymentMethod: "Bank Transfer",
            TransactionReference: expectedRef,
            Amount: 29990.00m,
            Notes: expectedNotes,
            PaymentDate: paymentDate,
            RecordedBy: "AdminChallenger"
        );

        var paymentResult = await _handler.Handle(command, CancellationToken.None);
        Assert.NotNull(paymentResult);

        // Execute GetBillingInfoQuery by TenantId GUID string
        var queryHandler = new GetBillingInfoQueryHandler(_context, _entitlements);
        var billingInfo = await queryHandler.Handle(new GetBillingInfoQuery(tenant.Id.ToString()), CancellationToken.None);

        Assert.NotNull(billingInfo);
        Assert.Equal("ACTIVE", billingInfo.SubscriptionStatus);
        Assert.True(billingInfo.IsAnnual);
        Assert.NotEmpty(billingInfo.Invoices);

        var invoiceDto = billingInfo.Invoices.Single(i => i.InvoiceNumber == paymentResult.InvoiceNumber);
        Assert.Equal("Paid", invoiceDto.Status);
        Assert.Equal("PHP", invoiceDto.Currency);
        Assert.Equal(29990.00m, invoiceDto.Amount);

        // Verify PaymentReceiptDto fields: Currency, TransactionReference, Notes, AmountPaid, PaymentMethod
        var receiptDto = invoiceDto.Receipt;
        Assert.NotNull(receiptDto);
        Assert.Equal(paymentResult.ReceiptNumber, receiptDto.ReceiptNumber);
        Assert.Equal("PHP", receiptDto.Currency);
        Assert.Equal(expectedRef, receiptDto.TransactionReference);
        Assert.Equal(expectedNotes, receiptDto.Notes);
        Assert.Equal("Bank Transfer", receiptDto.PaymentMethod);
        Assert.Equal(29990.00m, receiptDto.AmountPaid);
        Assert.Equal(paymentDate, receiptDto.PaidAt);
        Assert.Equal(paymentDate.AddYears(1), receiptDto.ExpiryDate);
    }

    [Fact]
    public async Task QueryReflection_GetBillingInfoQuery_ByTenantSlug_ReturnsCurrencyTransactionReferenceNotes()
    {
        const string slug = "slug-lookup-clinic";
        var (tenant, _) = await SeedTenantWithFacilityAsync(slug);
        var paymentDate = new DateTime(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc);
        const string expectedRef = "GCASH-REF-5544332211";
        const string expectedNotes = "GCash QR code counter settlement";

        var command = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: "GCash",
            TransactionReference: expectedRef,
            Amount: 2990.00m,
            Notes: expectedNotes,
            PaymentDate: paymentDate,
            RecordedBy: "AdminChallenger"
        );

        var paymentResult = await _handler.Handle(command, CancellationToken.None);
        Assert.NotNull(paymentResult);

        // Execute GetBillingInfoQuery by TenantSlug string
        var queryHandler = new GetBillingInfoQueryHandler(_context, _entitlements);
        var billingInfo = await queryHandler.Handle(new GetBillingInfoQuery(slug), CancellationToken.None);

        Assert.NotNull(billingInfo);
        Assert.Equal("ACTIVE", billingInfo.SubscriptionStatus);
        Assert.False(billingInfo.IsAnnual);

        var invoiceDto = billingInfo.Invoices.Single(i => i.InvoiceNumber == paymentResult.InvoiceNumber);
        var receiptDto = invoiceDto.Receipt;

        Assert.NotNull(receiptDto);
        Assert.Equal("PHP", receiptDto.Currency);
        Assert.Equal(expectedRef, receiptDto.TransactionReference);
        Assert.Equal(expectedNotes, receiptDto.Notes);
        Assert.Equal("GCash", receiptDto.PaymentMethod);
        Assert.Equal(2990.00m, receiptDto.AmountPaid);
    }

    [Fact]
    public async Task QueryReflection_GetBillingInfoQuery_PromotionalPayment_ReturnsCorrectReceiptAndActiveStatus()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("promo-query-clinic");
        var paymentDate = new DateTime(2026, 10, 15, 14, 0, 0, DateTimeKind.Utc);
        const string promoNotes = "Free tier beta onboarding grant";

        var command = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: "Promotional",
            TransactionReference: null,
            Amount: 0.00m,
            Notes: promoNotes,
            PaymentDate: paymentDate,
            RecordedBy: "SuperAdmin"
        );

        var paymentResult = await _handler.Handle(command, CancellationToken.None);
        Assert.NotNull(paymentResult);

        var queryHandler = new GetBillingInfoQueryHandler(_context, _entitlements);
        var billingInfo = await queryHandler.Handle(new GetBillingInfoQuery(tenant.Id.ToString()), CancellationToken.None);

        Assert.NotNull(billingInfo);
        Assert.Equal("ACTIVE", billingInfo.SubscriptionStatus);

        var invoiceDto = billingInfo.Invoices.Single(i => i.InvoiceNumber == paymentResult.InvoiceNumber);
        Assert.Equal(0.00m, invoiceDto.Amount);
        Assert.Equal("Paid", invoiceDto.Status);

        var receiptDto = invoiceDto.Receipt;
        Assert.NotNull(receiptDto);
        Assert.Equal(0.00m, receiptDto.AmountPaid);
        Assert.Equal("PHP", receiptDto.Currency);
        Assert.Equal("Promotional", receiptDto.PaymentMethod);
        Assert.Null(receiptDto.TransactionReference);
        Assert.Equal(promoNotes, receiptDto.Notes);
    }

    // =========================================================================
    // 10. Sequential Numbering, Special Characters & Multiple Payments Integrity
    // =========================================================================

    [Fact]
    public async Task Boundary_MultiplePaymentsForSameTenant_PreservesReceiptsAndInvoicesInQuery()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("multi-payment-clinic");
        var date1 = new DateTime(2026, 10, 15, 9, 0, 0, DateTimeKind.Utc);
        var date2 = new DateTime(2026, 10, 15, 10, 0, 0, DateTimeKind.Utc);

        var cmd1 = new RecordManualPaymentCommand(
            tenant.Id, "starter", false, "Cash", null, 1500m, "First installment", date1);
        var res1 = await _handler.Handle(cmd1, CancellationToken.None);

        var cmd2 = new RecordManualPaymentCommand(
            tenant.Id, "starter", false, "GCash", "GC-8877", 1500m, "Second installment", date2);
        var res2 = await _handler.Handle(cmd2, CancellationToken.None);

        Assert.NotNull(res1);
        Assert.NotNull(res2);
        Assert.NotEqual(res1.InvoiceNumber, res2.InvoiceNumber);
        Assert.NotEqual(res1.ReceiptNumber, res2.ReceiptNumber);

        var queryHandler = new GetBillingInfoQueryHandler(_context, _entitlements);
        var billingInfo = await queryHandler.Handle(new GetBillingInfoQuery(tenant.Id.ToString()), CancellationToken.None);

        Assert.NotNull(billingInfo);
        Assert.Equal(2, billingInfo.Invoices.Count);

        // Verify invoices are ordered descending by CreatedAt
        Assert.Equal(res2.InvoiceNumber, billingInfo.Invoices[0].InvoiceNumber);
        Assert.Equal("GC-8877", billingInfo.Invoices[0].Receipt?.TransactionReference);

        Assert.Equal(res1.InvoiceNumber, billingInfo.Invoices[1].InvoiceNumber);
        Assert.Null(billingInfo.Invoices[1].Receipt?.TransactionReference);
    }

    [Fact]
    public async Task Boundary_SpecialCharactersAndExactCentPrecision_PersistedAndReflectedWithoutCorruption()
    {
        var (tenant, _) = await SeedTenantWithFacilityAsync("special-chars-clinic");
        const string specialRef = "BPI-PAY/2026-10#9988_VAL";
        const string specialNotes = "Paid ₱14,999.55 via BPI Express Online by Dr. Dela Cruz (OIC) — ref: #9988 & verified!";
        const decimal exactAmount = 14999.55m;

        var command = new RecordManualPaymentCommand(
            TenantId: tenant.Id,
            PlanSlug: "starter",
            IsAnnual: false,
            PaymentMethod: "Bank Transfer",
            TransactionReference: specialRef,
            Amount: exactAmount,
            Notes: specialNotes,
            PaymentDate: DateTime.UtcNow,
            RecordedBy: "AdminChallenger"
        );

        var result = await _handler.Handle(command, CancellationToken.None);
        Assert.NotNull(result);

        var queryHandler = new GetBillingInfoQueryHandler(_context, _entitlements);
        var billingInfo = await queryHandler.Handle(new GetBillingInfoQuery(tenant.Id.ToString()), CancellationToken.None);

        Assert.NotNull(billingInfo);
        var invoice = billingInfo.Invoices.Single(i => i.InvoiceNumber == result.InvoiceNumber);
        Assert.Equal(exactAmount, invoice.Amount);
        Assert.NotNull(invoice.Receipt);
        Assert.Equal(exactAmount, invoice.Receipt.AmountPaid);
        Assert.Equal(specialRef, invoice.Receipt.TransactionReference);
        Assert.Equal(specialNotes, invoice.Receipt.Notes);
    }
}
