using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class InvoiceDuplicatePreventionTests
{
    [Fact]
    public async Task CreateInvoice_WhenQueueItemAlreadyHasPaidInvoice_ThrowsConflictException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        // Pre-existing paid invoice for this queue item
        var existingInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            InvoiceNumber = "INV-20261008-001",
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            QueueItemId = queueItemId,
            Status = InvoiceStatus.Paid,
            GrossAmount = 500m,
            NetAmount = 500m
        };
        await context.Invoices.AddAsync(existingInvoice);
        await context.SaveChangesAsync();

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<ClinicPatient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            uow,
            clinicContext,
            NSubstitute.Substitute.For<ClinicEz.Clinic.Application.Common.Interfaces.IBillingRequestPublisher>());

        var command = new CreateInvoiceCommand(
            patientId,
            "Juan Dela Cruz",
            QueueItemId: queueItemId
        );

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("*already been generated and paid for this encounter*");
    }

    [Fact]
    public async Task CreateInvoice_WhenAllowDuplicateIsTrue_AllowsSecondInvoice()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var existingInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            InvoiceNumber = "INV-20261008-001",
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            QueueItemId = queueItemId,
            Status = InvoiceStatus.Paid,
            GrossAmount = 500m,
            NetAmount = 500m
        };
        await context.Invoices.AddAsync(existingInvoice);
        await context.SaveChangesAsync();

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<ClinicPatient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            uow,
            clinicContext,
            NSubstitute.Substitute.For<ClinicEz.Clinic.Application.Common.Interfaces.IBillingRequestPublisher>());

        var command = new CreateInvoiceCommand(
            patientId,
            "Juan Dela Cruz",
            QueueItemId: queueItemId,
            AllowDuplicate: true
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.InvoiceNumber.Should().NotBeNullOrWhiteSpace();
        result.InvoiceNumber.Should().NotBe(existingInvoice.InvoiceNumber);
    }

    [Fact]
    public async Task CreateInvoice_WhenDraftInvoiceExists_MergesChargesFromSecondDoctorWithoutConflict()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();
        var doctorAId = Guid.NewGuid();
        var doctorBId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        // Initial Draft invoice created by Doctor A
        var draftInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            InvoiceNumber = "INV-20261021-001",
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            QueueItemId = queueItemId,
            Status = InvoiceStatus.Draft,
            GrossAmount = 500m,
            NetAmount = 500m,
            BalanceDue = 500m,
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    DoctorId = doctorAId,
                    DoctorName = "Dr. Alice Ramos",
                    ItemCode = "CONS-GEN",
                    Description = "General Consultation",
                    Category = "Consultation",
                    UnitPrice = 500m,
                    Quantity = 1,
                    TotalPrice = 500m
                }
            }
        };
        await context.Invoices.AddAsync(draftInvoice);
        await context.SaveChangesAsync();

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<ClinicPatient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            uow,
            clinicContext,
            NSubstitute.Substitute.For<ClinicEz.Clinic.Application.Common.Interfaces.IBillingRequestPublisher>());

        // Doctor B adds a procedure charge to the same queue encounter
        var doctorBCommand = new CreateInvoiceCommand(
            patientId,
            "Juan Dela Cruz",
            QueueItemId: queueItemId,
            AttendingDoctorId: doctorBId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(
                    DoctorId: doctorBId,
                    DoctorName: "Dr. Bob Santos",
                    ServiceItemId: Guid.NewGuid(),
                    ItemCode: "PROC-DENT-01",
                    Description: "Tooth Extraction",
                    Category: "Dental Procedure",
                    UnitPrice: 1200m,
                    Quantity: 1
                )
            }
        );

        // Act
        var result = await handler.Handle(doctorBCommand, CancellationToken.None);

        // Assert - Should merge into existing invoice without throwing 409 Conflict
        result.Should().NotBeNull();
        result.Id.Should().Be(draftInvoice.Id);
        result.InvoiceNumber.Should().Be("INV-20261021-001");
        result.Status.Should().Be(InvoiceStatus.Draft);
        result.GrossAmount.Should().Be(1700m);
        result.NetAmount.Should().Be(1700m);
        result.BalanceDue.Should().Be(1700m);
        result.LineItems.Should().HaveCount(2);

        var firstItem = result.LineItems[0];
        firstItem.DoctorName.Should().Be("Dr. Alice Ramos");
        firstItem.Description.Should().Be("General Consultation");
        firstItem.TotalPrice.Should().Be(500m);

        var secondItem = result.LineItems[1];
        secondItem.DoctorId.Should().Be(doctorBId);
        secondItem.DoctorName.Should().Be("Dr. Bob Santos");
        secondItem.Description.Should().Be("Tooth Extraction");
        secondItem.TotalPrice.Should().Be(1200m);
    }

    [Fact]
    public async Task CreateInvoice_WhenDraftInvoiceWithDiscountExists_MergesAndRecalculatesDiscountsAccurately()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();
        var doctorAId = Guid.NewGuid();
        var doctorBId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        // Pre-existing draft invoice with Senior Citizen discount (20%)
        var draftInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            InvoiceNumber = "INV-20261021-002",
            PatientId = patientId,
            PatientName = "Senior Patient",
            QueueItemId = queueItemId,
            Status = InvoiceStatus.Draft,
            DiscountType = DiscountType.SeniorCitizen,
            DiscountIdNumber = "OSCA-12345",
            DiscountPercentage = 20m,
            GrossAmount = 1000m,
            DiscountAmount = 200m,
            NetAmount = 800m,
            BalanceDue = 800m,
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    DoctorId = doctorAId,
                    DoctorName = "Dr. Alice Ramos",
                    Description = "Specialist Consult",
                    Category = "Consultation",
                    UnitPrice = 1000m,
                    Quantity = 1,
                    TotalPrice = 1000m
                }
            }
        };
        await context.Invoices.AddAsync(draftInvoice);
        await context.SaveChangesAsync();

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<ClinicPatient>(context, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve),
            uow,
            clinicContext,
            NSubstitute.Substitute.For<ClinicEz.Clinic.Application.Common.Interfaces.IBillingRequestPublisher>());

        // Doctor B adds another procedure item of 2000m
        var doctorBCommand = new CreateInvoiceCommand(
            patientId,
            "Senior Patient",
            QueueItemId: queueItemId,
            AttendingDoctorId: doctorBId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(
                    DoctorId: doctorBId,
                    DoctorName: "Dr. Bob Santos",
                    ServiceItemId: null,
                    ItemCode: "PROC-01",
                    Description: "Minor Procedure",
                    Category: "Procedure",
                    UnitPrice: 2000m,
                    Quantity: 1
                )
            }
        );

        // Act
        var result = await handler.Handle(doctorBCommand, CancellationToken.None);

        // Assert - Gross: 3000, Discount: 20% = 600, Net: 2400
        result.GrossAmount.Should().Be(3000m);
        result.DiscountPercentage.Should().Be(20m);
        result.DiscountAmount.Should().Be(600m);
        result.NetAmount.Should().Be(2400m);
        result.BalanceDue.Should().Be(2400m);
        result.LineItems.Should().HaveCount(2);
    }
}
