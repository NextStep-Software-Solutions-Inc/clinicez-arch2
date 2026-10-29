using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Empirical Adversarial Challenger Test Suite:
/// Milestone 3 Walk-In Retail Billing, Anonymous POS, Statutory Discounts,
/// Centralized Cashier Interop Guarding, and Local Payment Settlement.
/// </summary>
public class WalkInRetailBillingAdversarialTests
{
    private static (Guid clinicId, string tenantId, IClinicContext clinicContext) SetupClinicContext()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = $"tenant_challenger_{Guid.NewGuid():N}";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(Guid.NewGuid());
        return (clinicId, tenantId, clinicContext);
    }

    #region Group 1: CreateInvoiceCommand Walk-In Retail & Identity Resilience

    [Fact]
    public async Task Challenge_01_RetailWalkIn_NullPatientId_WithCustomerName_SetsRetailDefaults_AndDoesNotForward()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            uow,
            clinicContext,
            publisher);

        var command = new CreateInvoiceCommand(
            PatientId: null,
            PatientName: null,
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "MED-PCM-500", "Paracetamol 500mg Tab", "Medicine", 12.50m, 10)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: "Ka Pedro",
            VisitType: VisitType.RetailPurchase);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.PatientId.Should().Be(Guid.Empty, "Walk-in retail without a registered patient must use Guid.Empty");
        result.PatientName.Should().Be("Ka Pedro");
        result.GrossAmount.Should().Be(125m);
        result.NetAmount.Should().Be(125m);
        result.BalanceDue.Should().Be(125m);
        result.Status.Should().Be(InvoiceStatus.Draft);

        // Interop guardrail: must NOT dispatch to billing cashier counter
        await publisher.DidNotReceiveWithAnyArgs().PublishInvoiceRequestedAsync(default!, default!);
    }

    [Fact]
    public async Task Challenge_02_RetailWalkIn_EmptyGuidPatientId_WithCustomerName_SetsRetailDefaults()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            uow,
            clinicContext,
            publisher);

        var command = new CreateInvoiceCommand(
            PatientId: Guid.Empty,
            PatientName: "",
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "SUP-GAUZE", "Sterile Gauze Pad 4x4", "Supply", 35m, 4)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: "Doña Victorina",
            VisitType: VisitType.RetailPurchase);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.PatientId.Should().Be(Guid.Empty);
        result.PatientName.Should().Be("Doña Victorina");
        result.GrossAmount.Should().Be(140m);
        result.NetAmount.Should().Be(140m);

        await publisher.DidNotReceiveWithAnyArgs().PublishInvoiceRequestedAsync(default!, default!);
    }

    [Fact]
    public async Task Challenge_03_RetailWalkIn_OmittedNames_ThrowsBadRequestException()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            uow,
            clinicContext,
            Substitute.For<IBillingRequestPublisher>());

        var command = new CreateInvoiceCommand(
            PatientId: null,
            PatientName: null,
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "OTC-ALCOHOL", "70% Isopropyl Alcohol 500ml", "Supply", 85m, 1)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: null);

        var act = () => handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Customer name is required for Walk-In Retail POS invoices*");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n")]
    public async Task Challenge_03b_RetailWalkIn_WhitespaceNames_ThrowsBadRequestException(string blankName)
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            uow,
            clinicContext,
            Substitute.For<IBillingRequestPublisher>());

        var command = new CreateInvoiceCommand(
            PatientId: null,
            PatientName: blankName,
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "OTC-ALCOHOL", "70% Isopropyl Alcohol 500ml", "Supply", 85m, 1)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: blankName);

        var act = () => handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Customer name is required for Walk-In Retail POS invoices*");
    }

    [Fact]
    public async Task Challenge_04_NonRetail_WithoutPatientId_ThrowsBadRequestException()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            uow,
            clinicContext,
            Substitute.For<IBillingRequestPublisher>());

        // Non-retail (IsWalkInRetail: false) missing PatientId
        var cmdMissingPatientId = new CreateInvoiceCommand(
            PatientId: null,
            PatientName: "Some Patient",
            IsWalkInRetail: false);

        var act1 = () => handler.Handle(cmdMissingPatientId, CancellationToken.None);
        await act1.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*PatientId and PatientName are required*");

        // Non-retail with Guid.Empty
        var cmdEmptyGuid = new CreateInvoiceCommand(
            PatientId: Guid.Empty,
            PatientName: "Some Patient",
            IsWalkInRetail: false);

        var act2 = () => handler.Handle(cmdEmptyGuid, CancellationToken.None);
        await act2.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*PatientId and PatientName are required*");

        // Non-retail with whitespace name
        var cmdWhitespaceName = new CreateInvoiceCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "   ",
            IsWalkInRetail: false);

        var act3 = () => handler.Handle(cmdWhitespaceName, CancellationToken.None);
        await act3.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*PatientId and PatientName are required*");
    }

    #endregion

    #region Group 2: Senior/PWD Statutory Discount Calculation & Boundary Validation

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Challenge_05_SeniorCitizen_MissingDiscountId_ThrowsBadRequestException(string? invalidId)
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            uow,
            clinicContext,
            Substitute.For<IBillingRequestPublisher>());

        var command = new CreateInvoiceCommand(
            PatientId: null,
            DiscountType: DiscountType.SeniorCitizen,
            DiscountIdNumber: invalidId,
            IsWalkInRetail: true,
            WalkInCustomerName: "Customer With Senior Discount",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "MED-AMLO", "Amlodipine 5mg", "Medicine", 15m, 30)
            });

        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Discount ID number is required for Senior Citizen and PWD discounts*");
    }

    [Theory]
    [InlineData("1")]
    [InlineData("12")]
    [InlineData("AB")]
    public async Task Challenge_06_SeniorAndPwd_DiscountIdTooShort_ThrowsBadRequestException(string shortId)
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            uow,
            clinicContext,
            Substitute.For<IBillingRequestPublisher>());

        var cmdSenior = new CreateInvoiceCommand(
            PatientId: null,
            DiscountType: DiscountType.SeniorCitizen,
            DiscountIdNumber: shortId,
            IsWalkInRetail: true,
            WalkInCustomerName: "Customer With Senior Discount",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "MED-AMLO", "Amlodipine 5mg", "Medicine", 15m, 30)
            });

        var actSenior = () => handler.Handle(cmdSenior, CancellationToken.None);
        await actSenior.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Invalid Senior Citizen / PWD ID number format*");

        var cmdPwd = new CreateInvoiceCommand(
            PatientId: null,
            DiscountType: DiscountType.Pwd,
            DiscountIdNumber: shortId,
            IsWalkInRetail: true,
            WalkInCustomerName: "Customer With PWD Discount",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "MED-AMLO", "Amlodipine 5mg", "Medicine", 15m, 30)
            });

        var actPwd = () => handler.Handle(cmdPwd, CancellationToken.None);
        await actPwd.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Invalid Senior Citizen / PWD ID number format*");
    }

    [Theory]
    [InlineData(100.00, 20.00, 80.00)]
    [InlineData(1250.75, 250.15, 1000.60)]
    [InlineData(33.33, 6.67, 26.66)]
    public async Task Challenge_07_RegulatorySeniorDiscount_RoundingAndNetAmountCalculations(
        decimal gross, decimal expectedDiscount, decimal expectedNet)
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            uow,
            clinicContext,
            Substitute.For<IBillingRequestPublisher>());

        var command = new CreateInvoiceCommand(
            PatientId: null,
            DiscountType: DiscountType.SeniorCitizen,
            DiscountIdNumber: "OSCA-999-NCR",
            IsWalkInRetail: true,
            WalkInCustomerName: "Lolo Jose",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "MED-CUSTOM", "Prescription Items", "Medicine", gross, 1)
            });

        var result = await handler.Handle(command, CancellationToken.None);

        result.GrossAmount.Should().Be(gross);
        result.DiscountPercentage.Should().Be(20.00m);
        result.DiscountAmount.Should().Be(expectedDiscount);
        result.NetAmount.Should().Be(expectedNet);
        result.BalanceDue.Should().Be(expectedNet);
    }

    #endregion

    #region Group 3: Centralized Cashier Counter Interop Guarding (F11)

    [Fact]
    public async Task Challenge_08_CashierCounterMode_WalkInRetail_DoesNotForwardToCashierCounter_AndSettlesLocally()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        // Configure clinic with centralized CashierCounter mode
        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Centralized Hospital Outpatient Department",
            CashierMode = "CashierCounter"
        };
        await context.Set<FacilitySettings>().AddAsync(settings);
        await context.SaveChangesAsync();

        var createHandler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            settingsRepo,
            uow,
            clinicContext,
            publisher);

        var command = new CreateInvoiceCommand(
            PatientId: null,
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "SUP-SYRINGE", "Disposable Syringe 5ml", "Supply", 25m, 4)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: "Retail Customer A",
            VisitType: VisitType.RetailPurchase);

        var invoiceDto = await createHandler.Handle(command, CancellationToken.None);

        // Interop check: Forwarding MUST be skipped
        await publisher.DidNotReceiveWithAnyArgs().PublishInvoiceRequestedAsync(default!, default!);

        // Verify BillingRequestedAt is null
        var persistedInvoice = await context.Invoices.FirstAsync(i => i.Id == invoiceDto.Id);
        persistedInvoice.BillingRequestedAt.Should().BeNull(
            "Retail walk-in invoice must not be assigned a BillingRequestedAt timestamp");

        // Record payment locally at clinic desk: MUST SUCCEED without throwing PaidAtBillingCounterException
        var interopPublisher = Substitute.For<IInteropPublisher>();
        var paymentHandler = new RecordPaymentCommandHandler(
            invoiceRepo,
            null,
            uow,
            clinicContext,
            interopPublisher);

        var paymentCmd = new RecordPaymentCommand(
            InvoiceId: invoiceDto.Id,
            Amount: 100m,
            Method: PaymentMethod.Cash,
            Notes: "Full settlement at retail desk");

        var paymentResult = await paymentHandler.Handle(paymentCmd, CancellationToken.None);

        paymentResult.Status.Should().Be(InvoiceStatus.Paid);
        paymentResult.AmountPaid.Should().Be(100m);
        paymentResult.BalanceDue.Should().Be(0m);
        paymentResult.Payments.Should().HaveCount(1);
        paymentResult.Payments[0].PaymentNumber.Should().StartWith("OR-");
    }

    [Fact]
    public async Task Challenge_09_CashierCounterMode_WalkInRetail_WithKnownPatientId_DoesNotForward()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Multi-Facility Medical Center",
            CashierMode = "CashierCounter"
        };
        await context.Set<FacilitySettings>().AddAsync(settings);
        await context.SaveChangesAsync();

        var knownPatientId = Guid.NewGuid();

        var createHandler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<Patient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            settingsRepo,
            uow,
            clinicContext,
            publisher);

        // Retail purchase where customer happens to have a PatientId, but IsWalkInRetail is TRUE
        var command = new CreateInvoiceCommand(
            PatientId: knownPatientId,
            PatientName: "Patient Buying OTC",
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "MED-VITC", "Vitamin C 500mg", "Medicine", 8m, 20)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: "Patient Buying OTC",
            VisitType: VisitType.RetailPurchase);

        var invoiceDto = await createHandler.Handle(command, CancellationToken.None);

        // Interop guardrail: IsWalkInRetail == true prevents forwarding even with non-empty PatientId
        await publisher.DidNotReceiveWithAnyArgs().PublishInvoiceRequestedAsync(default!, default!);

        var persistedInvoice = await context.Invoices.FirstAsync(i => i.Id == invoiceDto.Id);
        persistedInvoice.BillingRequestedAt.Should().BeNull();
    }

    [Fact]
    public async Task Challenge_10_CashierCounterMode_RegisteredConsultation_ForwardsToCashierCounter_AndBlocksLocalPayment()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();
        publisher.PublishInvoiceRequestedAsync(default!, default!).ReturnsForAnyArgs(true);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Centralized Hospital Outpatient Department",
            CashierMode = "CashierCounter"
        };
        await context.Set<FacilitySettings>().AddAsync(settings);

        var registeredPatient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-2026-001",
            FirstName = "Juan",
            LastName = "Luna",
            ContactNumber = "09171234567",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = BiologicalSex.Male,
            CloudPatientId = Guid.NewGuid()
        };
        await context.Set<Patient>().AddAsync(registeredPatient);
        await context.SaveChangesAsync();

        var createHandler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            patientRepo,
            encounterRepo,
            settingsRepo,
            uow,
            clinicContext,
            publisher);

        // Standard registered consultation: IsWalkInRetail is FALSE
        var command = new CreateInvoiceCommand(
            PatientId: registeredPatient.Id,
            PatientName: "Juan Luna",
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "CONS-GEN", "General Consultation", "Consultation", 500m, 1)
            },
            IsWalkInRetail: false);

        var invoiceDto = await createHandler.Handle(command, CancellationToken.None);

        // Must forward to CashierCounter
        await publisher.Received(1).PublishInvoiceRequestedAsync(
            Arg.Is<BillingInvoiceRequestedPayload>(p =>
                p.InvoiceRequestId == invoiceDto.Id &&
                p.PatientName == "Juan Luna"),
            Arg.Any<CancellationToken>());

        var persistedInvoice = await context.Invoices.FirstAsync(i => i.Id == invoiceDto.Id);
        persistedInvoice.BillingRequestedAt.Should().NotBeNull();

        // Attempting local settlement must throw PaidAtBillingCounterException
        var paymentHandler = new RecordPaymentCommandHandler(
            invoiceRepo,
            null,
            uow,
            clinicContext,
            Substitute.For<IInteropPublisher>());

        var paymentCmd = new RecordPaymentCommand(
            InvoiceId: invoiceDto.Id,
            Amount: 500m,
            Method: PaymentMethod.Cash);

        var act = () => paymentHandler.Handle(paymentCmd, CancellationToken.None);
        await act.Should().ThrowAsync<PaidAtBillingCounterException>()
            .WithMessage($"*{invoiceDto.InvoiceNumber}*");
    }

    #endregion

    #region Group 4: Local Settlement Partial Payments & Pharmacy OTC Interop

    [Fact]
    public async Task Challenge_11_LocalSettlement_PartialPayments_UpdatesStatusAndBalanceAccurately()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            InvoiceNumber = "INV-20261023-099",
            PatientId = Guid.Empty,
            PatientName = "Walk-In Retail Guest",
            GrossAmount = 500m,
            NetAmount = 500m,
            BalanceDue = 500m,
            AmountPaid = 0m,
            Status = InvoiceStatus.Draft,
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    ItemCode = "MED-VIT",
                    Description = "Multivitamins 100s",
                    Category = "Medicine",
                    UnitPrice = 500m,
                    Quantity = 1,
                    TotalPrice = 500m
                }
            }
        };
        await context.Invoices.AddAsync(invoice);
        await context.SaveChangesAsync();

        var paymentHandler = new RecordPaymentCommandHandler(
            invoiceRepo,
            null,
            uow,
            clinicContext,
            Substitute.For<IInteropPublisher>());

        // 1st Partial Payment: 200m
        var payment1 = await paymentHandler.Handle(
            new RecordPaymentCommand(invoice.Id, 200m, PaymentMethod.Cash, Notes: "Partial 1"),
            CancellationToken.None);

        payment1.AmountPaid.Should().Be(200m);
        payment1.BalanceDue.Should().Be(300m);
        payment1.Status.Should().Be(InvoiceStatus.PartiallyPaid);
        payment1.Payments.Should().HaveCount(1);
        payment1.Payments[0].PaymentNumber.Should().Be($"OR-{payment1.Payments[0].PaymentDate:yyyyMMdd}-001");

        // 2nd Partial Payment: 300m (completes balance)
        var payment2 = await paymentHandler.Handle(
            new RecordPaymentCommand(invoice.Id, 300m, PaymentMethod.GCash, Notes: "Partial 2 Final"),
            CancellationToken.None);

        payment2.AmountPaid.Should().Be(500m);
        payment2.BalanceDue.Should().Be(0m);
        payment2.Status.Should().Be(InvoiceStatus.Paid);
        payment2.Payments.Should().HaveCount(2);
        payment2.Payments[1].PaymentNumber.Should().Be($"OR-{payment2.Payments[1].PaymentDate:yyyyMMdd}-002");
    }

    [Fact]
    public async Task Challenge_12_RecordPayment_DispensesPharmacyOtc_OnlyForMedicationsAndSupplies()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        // Invoice with mixed line items: Consultation, Medicine, Supply
        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            InvoiceNumber = "INV-20261023-088",
            PatientId = Guid.Empty,
            PatientName = "Walk-In Mixed Line Items",
            GrossAmount = 850m,
            NetAmount = 850m,
            BalanceDue = 850m,
            AmountPaid = 0m,
            Status = InvoiceStatus.Draft,
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    ItemCode = "CONS-01",
                    Description = "Quick Check",
                    Category = "Consultation",
                    UnitPrice = 300m,
                    Quantity = 1,
                    TotalPrice = 300m
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    ItemCode = "MED-IBU",
                    Description = "Ibuprofen 400mg",
                    Category = "Medicine",
                    UnitPrice = 15m,
                    Quantity = 10,
                    TotalPrice = 150m
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    ItemCode = "SUP-BAND",
                    Description = "Crepe Bandage",
                    Category = "Supply",
                    UnitPrice = 200m,
                    Quantity = 2,
                    TotalPrice = 400m
                }
            }
        };
        await context.Invoices.AddAsync(invoice);
        await context.SaveChangesAsync();

        var paymentHandler = new RecordPaymentCommandHandler(
            invoiceRepo,
            null,
            uow,
            clinicContext,
            interopPublisher);

        await paymentHandler.Handle(
            new RecordPaymentCommand(invoice.Id, 850m, PaymentMethod.Cash),
            CancellationToken.None);

        // Verify outbox payload filters out Consultation and includes ONLY Medicine and Supply lines
        interopPublisher.Received(1).Enqueue(
            Arg.Is<string>(type => type == InteropTypes.PharmacyOtcDispensed),
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            Arg.Is<Guid>(corr => corr == invoice.Id),
            Arg.Is<PharmacyOtcDispensedPayload>(p =>
                p.InvoiceId == invoice.Id &&
                p.Items.Count == 2 &&
                p.Items.Any(i => i.ItemCode == "MED-IBU" && i.Category == "Medicine") &&
                p.Items.Any(i => i.ItemCode == "SUP-BAND" && i.Category == "Supply") &&
                !p.Items.Any(i => i.Category == "Consultation")));
    }

    #endregion
}
