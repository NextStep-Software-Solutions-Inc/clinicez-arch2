using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Billing;

public class BillingControllerRetailValidationTests
{
    [Theory]
    [InlineData(null, null)]
    [InlineData("", "")]
    [InlineData("   ", "   ")]
    [InlineData("\t", "\n")]
    public async Task CreateInvoice_WalkInRetail_MissingCustomerName_ReturnsBadRequest(string? walkInName, string? patientName)
    {
        var sender = Substitute.For<ISender>();
        var controller = new BillingController(sender);

        var request = new CreateInvoiceRequest(
            PatientId: null,
            PatientName: patientName,
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "MED-PCM-500", "Paracetamol 500mg", "Medicine", 10m, 2)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: walkInName,
            VisitType: VisitType.RetailPurchase);

        var actionResult = await controller.CreateInvoice(request, CancellationToken.None);

        actionResult.Result.Should().BeOfType<BadRequestObjectResult>();
        var badRequest = (BadRequestObjectResult)actionResult.Result!;
        badRequest.StatusCode.Should().Be(400);

        var response = badRequest.Value as ApiResponse<InvoiceDto>;
        response.Should().NotBeNull();
        response!.Succeeded.Should().BeFalse();
        response.Message.Should().Be("Customer name is required for Walk-In Retail POS invoices.");
        response.Errors.Should().Contain(e => e.Field == "WalkInCustomerName" && e.Message == "Customer name is required for Walk-In Retail POS invoices.");

        await sender.DidNotReceiveWithAnyArgs().Send(Arg.Any<CreateInvoiceCommand>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CreateInvoice_WalkInRetail_ValidCustomerName_DispatchesCommandAndReturnsOk()
    {
        var sender = Substitute.For<ISender>();
        var controller = new BillingController(sender);

        var expectedDto = new InvoiceDto(
            Id: Guid.NewGuid(),
            TenantId: "default",
            ClinicId: Guid.NewGuid(),
            InvoiceNumber: "INV-20261026-001",
            InvoiceDate: DateTime.UtcNow,
            PatientId: Guid.Empty,
            PatientName: "Pedro Penduko",
            QueueItemId: null,
            AppointmentId: null,
            ConsultationId: null,
            AttendingDoctorId: null,
            GrossAmount: 100m,
            DiscountType: DiscountType.None,
            DiscountIdNumber: null,
            DiscountPercentage: 0m,
            DiscountAmount: 0m,
            NetAmount: 100m,
            AmountPaid: 0m,
            BalanceDue: 100m,
            Status: InvoiceStatus.Draft,
            Notes: null,
            BilledByStaffName: null,
            LineItems: new List<InvoiceLineItemDto>(),
            Payments: new List<PaymentRecordDto>());

        sender.Send(Arg.Any<CreateInvoiceCommand>(), Arg.Any<CancellationToken>())
            .Returns(expectedDto);

        var request = new CreateInvoiceRequest(
            PatientId: null,
            PatientName: null,
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "MED-PCM-500", "Paracetamol 500mg", "Medicine", 50m, 2)
            },
            IsWalkInRetail: true,
            WalkInCustomerName: "Pedro Penduko",
            VisitType: VisitType.RetailPurchase);

        var actionResult = await controller.CreateInvoice(request, CancellationToken.None);

        actionResult.Result.Should().BeOfType<OkObjectResult>();
        var okResult = (OkObjectResult)actionResult.Result!;
        okResult.StatusCode.Should().Be(200);

        var response = okResult.Value as ApiResponse<InvoiceDto>;
        response.Should().NotBeNull();
        response!.Succeeded.Should().BeTrue();
        response.Data!.PatientName.Should().Be("Pedro Penduko");

        await sender.Received(1).Send(
            Arg.Is<CreateInvoiceCommand>(c =>
                c.IsWalkInRetail &&
                c.WalkInCustomerName == "Pedro Penduko"),
            Arg.Any<CancellationToken>());
    }
}
