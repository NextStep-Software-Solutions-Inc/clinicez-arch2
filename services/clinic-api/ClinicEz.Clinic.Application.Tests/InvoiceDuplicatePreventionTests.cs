using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
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
    public async Task CreateInvoice_WhenQueueItemAlreadyHasActiveInvoice_ThrowsConflictException()
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

        // Pre-existing active invoice for this queue item
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
            .WithMessage("*already been generated for this queue encounter*");
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
}
