using System;
using System.Collections.Generic;
using System.Net;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Middlewares;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Middlewares;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>
/// The shared billing counter owns the collection of what was requested to it: the clinic's own cashier must not take a second
/// payment for it, while charges that were never sent to billing stay collectable locally.
/// </summary>
public class LocalCashierOwnershipTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string Tenant = "tenant-cashier";
    private readonly IClinicContext _clinicContext;

    public LocalCashierOwnershipTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(Tenant);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    private static CreateInvoiceCommand Command(DiscountType discount = DiscountType.None, Guid? consultationId = null) => new(
        PatientId: Guid.NewGuid(),
        PatientName: "Juan Dela Cruz",
        ConsultationId: consultationId,
        DiscountType: discount,
        LineItems: new List<CreateInvoiceLineItemRequest> { new(null, "CONS-GEN", "General Consultation", "Consultation", 500m, 1) });

    private async Task<(Invoice Invoice, ApplicationDbContext Db, IUnitOfWork Uow, IBillingRequestPublisher Billing)> CreateInvoiceAsync(
        bool billingAcceptsRequest, DiscountType discount = DiscountType.None, string cashierMode = "CashierCounter")
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        db.ClinicSettings.Add(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = Tenant,
            ClinicId = _clinicId,
            ClinicName = "Test Clinic",
            CashierMode = cashierMode
        });
        await db.SaveChangesAsync();

        var billing = Substitute.For<IBillingRequestPublisher>();
        billing.PublishInvoiceRequestedAsync(Arg.Any<BillingInvoiceRequestedPayload>(), Arg.Any<CancellationToken>()).Returns(billingAcceptsRequest);
        var handler = new CreateInvoiceCommandHandler(
            TestDbHelper.CreateRepository<Invoice>(db, sieve),
            TestDbHelper.CreateRepository<ClinicPatient>(db, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<ClinicSettings>(db, sieve),
            uow,
            _clinicContext,
            billing);

        var dto = await handler.Handle(Command(discount), CancellationToken.None);
        var invoice = await db.Invoices.IgnoreQueryFilters().SingleAsync(i => i.Id == dto.Id);
        return (invoice, db, uow, billing);
    }

    private static RecordPaymentCommandHandler PaymentHandler(
        ApplicationDbContext db, IUnitOfWork uow, IClinicContext clinicContext) =>
        new(TestDbHelper.CreateRepository<Invoice>(db, Substitute.For<ISieveProcessor>()),
            TestDbHelper.CreateRepository<PaymentRecord>(db, Substitute.For<ISieveProcessor>()),
            uow, clinicContext);

    [Fact]
    public async Task An_Invoice_Requested_To_Billing_Is_Marked_As_Owned_By_The_Counter()
    {
        var (invoice, _, _, billing) = await CreateInvoiceAsync(billingAcceptsRequest: true);

        invoice.BillingRequestedAt.Should().NotBeNull();
        await billing.Received(1).PublishInvoiceRequestedAsync(Arg.Any<BillingInvoiceRequestedPayload>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task An_Invoice_Billing_Could_Not_Take_Stays_Local()
    {
        var (invoice, _, _, _) = await CreateInvoiceAsync(billingAcceptsRequest: false);

        invoice.BillingRequestedAt.Should().BeNull("the clinic is not provisioned on this server, so nothing was queued");
    }

    [Fact]
    public async Task A_Zero_Net_Invoice_Is_Never_Sent_To_Billing()
    {
        var (invoice, _, _, billing) = await CreateInvoiceAsync(billingAcceptsRequest: true, DiscountType.PhilHealthKonsulta);

        invoice.NetAmount.Should().Be(0m);
        invoice.BillingRequestedAt.Should().BeNull();
        await billing.DidNotReceiveWithAnyArgs().PublishInvoiceRequestedAsync(default!, default);
    }

    [Fact]
    public async Task A_Local_Payment_On_A_Billing_Owned_Invoice_Is_Refused_And_Records_Nothing()
    {
        var (invoice, db, uow, _) = await CreateInvoiceAsync(billingAcceptsRequest: true);

        var pay = () => PaymentHandler(db, uow, _clinicContext)
            .Handle(new RecordPaymentCommand(invoice.Id, 500m, PaymentMethod.Cash), CancellationToken.None);

        await pay.Should().ThrowAsync<PaidAtBillingCounterException>().WithMessage("*billing counter*");
        var saved = await db.Invoices.IgnoreQueryFilters().Include(i => i.Payments).SingleAsync(i => i.Id == invoice.Id);
        saved.AmountPaid.Should().Be(0m);
        saved.Payments.Should().BeEmpty();
        saved.Status.Should().Be(InvoiceStatus.Draft);
    }

    [Fact]
    public async Task A_Local_Payment_On_An_Invoice_Never_Sent_To_Billing_Is_Accepted()
    {
        var (invoice, db, uow, _) = await CreateInvoiceAsync(billingAcceptsRequest: false);

        var result = await PaymentHandler(db, uow, _clinicContext)
            .Handle(new RecordPaymentCommand(invoice.Id, 500m, PaymentMethod.Cash), CancellationToken.None);

        result.Status.Should().Be(InvoiceStatus.Paid);
        result.AmountPaid.Should().Be(500m);
    }

    [Fact]
    public async Task A_Payment_Confirmed_At_The_Counter_Is_Still_Recorded_On_A_Billing_Owned_Invoice()
    {
        var (invoice, db, _, _) = await CreateInvoiceAsync(billingAcceptsRequest: true);
        MessagingTestKit.SeedClinic(db, _clinicId, Tenant);
        var counter = Party.ForFacility(Tenant, _clinicId.ToString(), FacilityType.Clinic, InteropServices.Billing);
        var payload = new BillingPaymentConfirmedPayload { InvoiceRequestId = invoice.Id, AmountDue = 500m, AmountPaid = 500m, FullyPaid = true, PaymentMethod = "Cash" };

        await new BillingPaymentConfirmedHandler(db, MessagingTestKit.Recipient(db), NullLogger<BillingPaymentConfirmedHandler>.Instance)
            .HandleAsync(payload,
                MessagingTestKit.Delivered(InteropTypes.BillingPaymentConfirmed, counter,
                    MessagingTestKit.ClinicParty(Tenant, _clinicId), invoice.Id, payload),
                CancellationToken.None);

        (await db.Invoices.IgnoreQueryFilters().SingleAsync(i => i.Id == invoice.Id)).Status.Should().Be(InvoiceStatus.Paid);
    }

    [Theory]
    [InlineData(InvoiceStatus.Voided)]
    [InlineData(InvoiceStatus.Refunded)]
    public async Task A_Payment_On_A_Voided_Or_Refunded_Invoice_Is_Rejected(InvoiceStatus status)
    {
        var (invoice, db, uow, _) = await CreateInvoiceAsync(billingAcceptsRequest: false);
        invoice.Status = status;
        await db.SaveChangesAsync();

        var pay = () => PaymentHandler(db, uow, _clinicContext)
            .Handle(new RecordPaymentCommand(invoice.Id, 100m, PaymentMethod.Cash), CancellationToken.None);

        await pay.Should().ThrowAsync<BadRequestException>();
    }

    [Theory]
    [InlineData(InvoiceStatus.Voided)]
    [InlineData(InvoiceStatus.Refunded)]
    [InlineData(InvoiceStatus.Paid)]
    public async Task A_Visit_Can_Be_Invoiced_Again_Only_After_Its_Invoice_Was_Voided_Or_Refunded(InvoiceStatus existing)
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultationId = Guid.NewGuid();
        db.Invoices.Add(new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = Tenant,
            ClinicId = _clinicId,
            InvoiceNumber = "INV-OLD",
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            ConsultationId = consultationId,
            NetAmount = 500m,
            Status = existing
        });
        await db.SaveChangesAsync();
        var handler = new CreateInvoiceCommandHandler(
            TestDbHelper.CreateRepository<Invoice>(db, sieve),
            TestDbHelper.CreateRepository<ClinicPatient>(db, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            uow,
            _clinicContext,
            Substitute.For<IBillingRequestPublisher>());

        var create = () => handler.Handle(Command(consultationId: consultationId), CancellationToken.None);

        if (existing == InvoiceStatus.Paid)
        {
            await create.Should().ThrowAsync<ConflictException>();
        }
        else
        {
            (await create.Invoke()).Status.Should().Be(InvoiceStatus.Draft);
        }
    }

    [Fact]
    public async Task The_Api_Answers_409_With_The_Machine_Readable_Code()
    {
        var (invoice, db, uow, _) = await CreateInvoiceAsync(billingAcceptsRequest: true);
        var handler = PaymentHandler(db, uow, _clinicContext);
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddExceptionHandler<ClinicExceptionHandler>();
        builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
        builder.Services.AddProblemDetails();
        await using var app = builder.Build();
        app.UseExceptionHandler();
        app.MapPost("/pay", async () => Results.Ok(await handler.Handle(new RecordPaymentCommand(invoice.Id, 500m, PaymentMethod.Cash), CancellationToken.None)));
        await app.StartAsync();

        var response = await app.GetTestClient().PostAsync("/pay", new StringContent("{}"));

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        json.RootElement.GetProperty("errors")[0].GetProperty("code").GetString().Should().Be("paid_at_billing_counter");
        json.RootElement.GetProperty("message").GetString().Should().Contain("billing counter");
    }

    [Fact]
    public async Task Other_Failures_Still_Use_The_Shared_Mapping()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddExceptionHandler<ClinicExceptionHandler>();
        builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
        builder.Services.AddProblemDetails();
        await using var app = builder.Build();
        app.UseExceptionHandler();
        app.MapGet("/boom", (Func<IResult>)(() => throw new ConflictException("duplicate")));
        await app.StartAsync();

        var response = await app.GetTestClient().GetAsync("/boom");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        json.RootElement.GetProperty("errors")[0].GetProperty("code").GetString().Should().Be("CONFLICT");
    }

    [Fact]
    public async Task When_In_ClinicDesk_Mode_Invoice_Is_Not_Sent_To_Billing_And_Local_Payment_Succeeds()
    {
        var (invoice, db, uow, billing) = await CreateInvoiceAsync(billingAcceptsRequest: true, cashierMode: "ClinicDesk");

        invoice.BillingRequestedAt.Should().BeNull("ClinicDesk mode keeps invoices local");
        await billing.DidNotReceiveWithAnyArgs().PublishInvoiceRequestedAsync(default!, default);

        var result = await PaymentHandler(db, uow, _clinicContext)
            .Handle(new RecordPaymentCommand(invoice.Id, 500m, PaymentMethod.Cash), CancellationToken.None);

        result.Status.Should().Be(InvoiceStatus.Paid);
        result.AmountPaid.Should().Be(500m);
        result.Payments.Should().HaveCount(1);
        result.Payments[0].PaymentNumber.Should().StartWith("OR-");
    }

    [Fact]
    public async Task UpdateInvoice_WhenDraft_UpdatesDiscountAndRecalculatesNetAmount()
    {
        var (invoice, db, uow, billing) = await CreateInvoiceAsync(billingAcceptsRequest: true, cashierMode: "ClinicDesk");

        var updateHandler = new UpdateInvoiceCommandHandler(
            TestDbHelper.CreateRepository<Invoice>(db, Substitute.For<ISieveProcessor>()),
            TestDbHelper.CreateRepository<ClinicPatient>(db, Substitute.For<ISieveProcessor>()),
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, Substitute.For<ISieveProcessor>()),
            TestDbHelper.CreateRepository<ClinicSettings>(db, Substitute.For<ISieveProcessor>()),
            uow,
            _clinicContext,
            billing);

        var updated = await updateHandler.Handle(new UpdateInvoiceCommand(
            invoice.Id,
            DiscountType.SeniorCitizen,
            "OSCA-12345",
            Notes: "Updated with Senior Citizen discount"), CancellationToken.None);

        updated.DiscountType.Should().Be(DiscountType.SeniorCitizen);
        updated.DiscountPercentage.Should().Be(20m);
        updated.DiscountAmount.Should().Be(100m);
        updated.NetAmount.Should().Be(400m);
        updated.BalanceDue.Should().Be(400m);
    }

    [Fact]
    public async Task Multiple_Payments_On_Same_Day_Across_Invoices_Get_Sequential_Receipt_Numbers()
    {
        var (invoice1, db, uow, _) = await CreateInvoiceAsync(billingAcceptsRequest: false, cashierMode: "ClinicDesk");

        var sieve = Substitute.For<ISieveProcessor>();
        var createHandler = new CreateInvoiceCommandHandler(
            TestDbHelper.CreateRepository<Invoice>(db, sieve),
            TestDbHelper.CreateRepository<ClinicPatient>(db, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            TestDbHelper.CreateRepository<ClinicSettings>(db, sieve),
            uow,
            _clinicContext,
            Substitute.For<IBillingRequestPublisher>());

        var dto2 = await createHandler.Handle(Command(), CancellationToken.None);
        var invoice2 = await db.Invoices.IgnoreQueryFilters().SingleAsync(i => i.Id == dto2.Id);

        var handler = PaymentHandler(db, uow, _clinicContext);

        var pay1 = await handler.Handle(new RecordPaymentCommand(invoice1.Id, 500m, PaymentMethod.Cash), CancellationToken.None);
        var pay2 = await handler.Handle(new RecordPaymentCommand(invoice2.Id, 500m, PaymentMethod.Cash), CancellationToken.None);

        var dateTag = DateTime.UtcNow.ToString("yyyyMMdd");
        pay1.Payments.Should().ContainSingle();
        pay1.Payments[0].PaymentNumber.Should().Be($"OR-{dateTag}-001");

        pay2.Payments.Should().ContainSingle();
        pay2.Payments[0].PaymentNumber.Should().Be($"OR-{dateTag}-002");
    }

    [Fact]
    public async Task UpdateInvoice_To_Zero_Net_RePublishes_When_Previously_Sent_To_Billing()
    {
        var (invoice, db, uow, billing) = await CreateInvoiceAsync(billingAcceptsRequest: true, cashierMode: "CashierCounter");
        invoice.BillingRequestedAt.Should().NotBeNull("initially sent to billing counter");

        var updateHandler = new UpdateInvoiceCommandHandler(
            TestDbHelper.CreateRepository<Invoice>(db, Substitute.For<ISieveProcessor>()),
            TestDbHelper.CreateRepository<ClinicPatient>(db, Substitute.For<ISieveProcessor>()),
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, Substitute.For<ISieveProcessor>()),
            TestDbHelper.CreateRepository<ClinicSettings>(db, Substitute.For<ISieveProcessor>()),
            uow,
            _clinicContext,
            billing);

        // Update to 100% PhilHealth Konsulta discount -> NetAmount becomes 0m
        var updated = await updateHandler.Handle(new UpdateInvoiceCommand(
            invoice.Id,
            DiscountType.PhilHealthKonsulta,
            Notes: "100% PhilHealth Konsulta applied"), CancellationToken.None);

        updated.NetAmount.Should().Be(0m);
        updated.Status.Should().Be(InvoiceStatus.Paid);

        // Total 2 publishes: 1 on create, 1 on update to 0-net
        await billing.Received(2).PublishInvoiceRequestedAsync(Arg.Any<BillingInvoiceRequestedPayload>(), Arg.Any<CancellationToken>());
        // Crucial: The update publish contains the 100% discount line (-500m)
        await billing.Received(1).PublishInvoiceRequestedAsync(
            Arg.Is<BillingInvoiceRequestedPayload>(p => p.InvoiceRequestId == invoice.Id && p.Lines.Any(l => l.Code == "DISCOUNT" && l.UnitPrice == -500m)),
            Arg.Any<CancellationToken>());
    }
}
