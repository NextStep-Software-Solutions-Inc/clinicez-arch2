using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
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
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Billing;

public class WalkInRetailBillingTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_walkin_test";

    [Fact]
    public async Task CreateInvoice_WalkInRetail_BypassesPatientLookup_AndSetsRetailDefaults()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

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
                new(null, "MED-PARACETAMOL", "Paracetamol 500mg", "Medicine", 10m, 5)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: "Walk-In Customer",
            VisitType: VisitType.RetailPurchase);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.PatientName.Should().Be("Walk-In Customer");
        result.GrossAmount.Should().Be(50m);
        result.NetAmount.Should().Be(50m);
        result.Status.Should().Be(InvoiceStatus.Draft);

        // Verify it was NOT forwarded to CashierCounter
        await publisher.DidNotReceiveWithAnyArgs().PublishInvoiceRequestedAsync(default!, default!);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("", "")]
    [InlineData("   ", "   ")]
    public async Task CreateInvoice_WalkInRetail_WithoutCustomerName_ThrowsBadRequestException(string? walkInName, string? patientName)
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

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
            PatientName: patientName,
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "MED-PARACETAMOL", "Paracetamol 500mg", "Medicine", 10m, 5)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: walkInName,
            VisitType: VisitType.RetailPurchase);

        var act = () => handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Customer name is required for Walk-In Retail POS invoices*");
    }

    [Fact]
    public async Task CreateInvoice_WalkInRetail_CustomCustomerName_IsPreserved()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

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
                new(null, "SUP-BANDAGE", "Elastic Bandage 4in", "Supply", 120m, 2)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: "Maria Clara",
            VisitType: VisitType.RetailPurchase);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.PatientName.Should().Be("Maria Clara");
        result.GrossAmount.Should().Be(240m);
        result.NetAmount.Should().Be(240m);
    }

    [Fact]
    public async Task CreateInvoice_SeniorCitizen_InvalidDiscountId_ThrowsValidationException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

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
            DiscountType: DiscountType.SeniorCitizen,
            DiscountIdNumber: "1", // Too short (< 3 chars)
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "MED-ASPIRIN", "Aspirin 80mg", "Medicine", 50m, 2)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: "Senior Citizen Customer");

        var act = () => handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Invalid Senior Citizen / PWD ID number format*");
    }

    [Fact]
    public async Task CreateInvoice_SeniorCitizen_ValidDiscountId_ComputesTwentyPercentDiscount()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

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
            DiscountType: DiscountType.SeniorCitizen,
            DiscountIdNumber: "OSCA-12345",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "MED-METFORMIN", "Metformin 500mg", "Medicine", 100m, 1)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: "Senior Citizen Customer");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.GrossAmount.Should().Be(100m);
        result.DiscountPercentage.Should().Be(20m);
        result.DiscountAmount.Should().Be(20m);
        result.NetAmount.Should().Be(80m);
    }

    [Fact]
    public async Task RecordPayment_WhenInvoiceHasMedicationLines_PublishesPharmacyOtcDispensedEvent()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            InvoiceNumber = "INV-20261023-001",
            PatientName = "Walk-In Retail Guest",
            GrossAmount = 200m,
            NetAmount = 200m,
            BalanceDue = 200m,
            Status = InvoiceStatus.Draft,
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    ItemCode = "MED-AMOXI",
                    Description = "Amoxicillin 500mg",
                    Category = "Medicine",
                    UnitPrice = 20m,
                    Quantity = 10,
                    TotalPrice = 200m
                }
            }
        };

        await context.Invoices.AddAsync(invoice);
        await context.SaveChangesAsync();

        var handler = new RecordPaymentCommandHandler(
            invoiceRepo,
            null,
            uow,
            clinicContext,
            interopPublisher);

        var command = new RecordPaymentCommand(
            InvoiceId: invoice.Id,
            Amount: 200m,
            Method: PaymentMethod.Cash,
            ReferenceNumber: null,
            Notes: "Full cash settlement");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.Status.Should().Be(InvoiceStatus.Paid);
        result.AmountPaid.Should().Be(200m);
        result.BalanceDue.Should().Be(0m);

        // Verify outbox published pharmacy.otc.dispensed
        interopPublisher.Received(1).Enqueue(
            Arg.Is<string>(type => type == InteropTypes.PharmacyOtcDispensed),
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            Arg.Is<Guid>(corr => corr == invoice.Id),
            Arg.Is<PharmacyOtcDispensedPayload>(payload =>
                payload.InvoiceId == invoice.Id &&
                payload.Items.Count == 1 &&
                payload.Items[0].ItemCode == "MED-AMOXI" &&
                payload.Items[0].Quantity == 10));
    }
}
