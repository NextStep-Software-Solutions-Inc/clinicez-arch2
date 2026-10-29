using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class BillingDocumentSeparationTests
{
    private readonly IClinicDocumentPdfService _pdfService = new ClinicDocumentPdfService();

    [Fact]
    public void GenerateInvoicePdf_OnPaidInvoice_Should_Generate_ValidPdf_And_Maintain_Document_Integrity()
    {
        var settings = new FacilitySettings
        {
            TenantId = "test-tenant",
            ClinicId = Guid.NewGuid(),
            ClinicName = "Clinic EZ Test Clinic"
        };

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            FirstName = "Jasmin",
            LastName = "Angeles",
            ContactNumber = "09171234567",
            DateOfBirth = new DateOnly(1995, 5, 12),
            Gender = Gender.Female,
            PatientCode = "P-10023"
        };

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            FirstName = "Roberto",
            LastName = "Santos",
            Title = "Dr.",
            PrcLicenseNumber = "PRC-123456"
        };

        var paidInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = settings.TenantId,
            ClinicId = settings.ClinicId,
            InvoiceNumber = "INV-20261026-001",
            InvoiceDate = DateTime.UtcNow,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            AttendingDoctorId = doctor.Id,
            GrossAmount = 350m,
            DiscountAmount = 0m,
            NetAmount = 350m,
            AmountPaid = 350m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            BilledByStaffName = "Cashier Station",
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    Description = "General Consultation",
                    Category = "Consultation",
                    UnitPrice = 350m,
                    Quantity = 1,
                    TotalPrice = 350m,
                    DoctorName = "Dr. Roberto Santos"
                }
            },
            Payments = new List<PaymentRecord>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    PaymentNumber = "OR-20261026-001",
                    Amount = 350m,
                    Method = PaymentMethod.Cash,
                    PaymentDate = DateTime.UtcNow,
                    ReceivedByStaffName = "Cashier Station"
                }
            }
        };

        // Statement of Account (SOA) for paid invoice
        var soaBytes = _pdfService.GenerateInvoicePdf(paidInvoice, settings, doctor, patient);
        soaBytes.Should().NotBeNull();
        soaBytes.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(soaBytes, 0, 10).Should().StartWith("%PDF-");

        // Official Receipt (OR) for the same invoice & payment
        var receiptBytes = _pdfService.GenerateOfficialReceiptPdf(paidInvoice, paidInvoice.Payments.First(), settings, doctor, patient);
        receiptBytes.Should().NotBeNull();
        receiptBytes.Length.Should().BeGreaterThan(1000);
        Encoding.ASCII.GetString(receiptBytes, 0, 10).Should().StartWith("%PDF-");
    }

    [Fact]
    public async Task BillingController_DownloadInvoicePdf_Should_Return_SOA_Filename_For_Paid_Invoice()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        var clinicId = Guid.NewGuid();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var sender = Substitute.For<ISender>();
        var pdfService = Substitute.For<IClinicDocumentPdfService>();

        var invoiceId = Guid.NewGuid();
        var invoice = new Invoice
        {
            Id = invoiceId,
            TenantId = "tenant-test",
            ClinicId = clinicId,
            InvoiceNumber = "INV-20261026-002",
            PatientName = "Artemio Dizon",
            Status = InvoiceStatus.Paid,
            GrossAmount = 700m,
            NetAmount = 700m,
            AmountPaid = 700m,
            BalanceDue = 0m,
            LineItems = new List<InvoiceLineItem>(),
            Payments = new List<PaymentRecord>
            {
                new() { PaymentNumber = "OR-20261026-002", Amount = 700m, PaymentDate = DateTime.UtcNow }
            }
        };
        await db.Invoices.AddAsync(invoice);
        await db.SaveChangesAsync();

        pdfService.GenerateInvoicePdf(Arg.Any<Invoice>(), Arg.Any<FacilitySettings>(), Arg.Any<StaffMember?>(), Arg.Any<Patient?>(), Arg.Any<string?>())
            .Returns(Encoding.ASCII.GetBytes("%PDF-1.4 Fake PDF Content"));

        var controller = new BillingController(
            sender,
            pdfService,
            invoiceRepo,
            settingsRepo
        );

        var result = await controller.DownloadInvoicePdf(invoiceId, null, CancellationToken.None);

        var fileResult = result.Should().BeOfType<FileContentResult>().Subject;
        fileResult.ContentType.Should().Be("application/pdf");
        fileResult.FileDownloadName.Should().Be("SOA-INV-20261026-002.pdf");
    }

    [Fact]
    public async Task BillingController_DownloadReceiptPdf_Should_Return_Receipt_Filename()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        var clinicId = Guid.NewGuid();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var sender = Substitute.For<ISender>();
        var pdfService = Substitute.For<IClinicDocumentPdfService>();

        var invoiceId = Guid.NewGuid();
        var invoice = new Invoice
        {
            Id = invoiceId,
            TenantId = "tenant-test",
            ClinicId = clinicId,
            InvoiceNumber = "INV-20261026-002",
            PatientName = "Artemio Dizon",
            Status = InvoiceStatus.Paid,
            GrossAmount = 700m,
            NetAmount = 700m,
            AmountPaid = 700m,
            BalanceDue = 0m,
            LineItems = new List<InvoiceLineItem>(),
            Payments = new List<PaymentRecord>
            {
                new() { PaymentNumber = "OR-20261026-002", Amount = 700m, PaymentDate = DateTime.UtcNow }
            }
        };
        await db.Invoices.AddAsync(invoice);
        await db.SaveChangesAsync();

        pdfService.GenerateOfficialReceiptPdf(Arg.Any<Invoice>(), Arg.Any<PaymentRecord?>(), Arg.Any<FacilitySettings>(), Arg.Any<StaffMember?>(), Arg.Any<Patient?>(), Arg.Any<string?>())
            .Returns(Encoding.ASCII.GetBytes("%PDF-1.4 Fake Receipt Content"));

        var controller = new BillingController(
            sender,
            pdfService,
            invoiceRepo,
            settingsRepo
        );

        var result = await controller.DownloadReceiptPdf(invoiceId, null, CancellationToken.None);

        var fileResult = result.Should().BeOfType<FileContentResult>().Subject;
        fileResult.ContentType.Should().Be("application/pdf");
        fileResult.FileDownloadName.Should().Be("Receipt-OR-20261026-002.pdf");
    }

    [Fact]
    public async Task BillingController_DownloadInvoicePdf_With_TypeReceipt_Should_Route_To_Receipt()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        var clinicId = Guid.NewGuid();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant-test");

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var sender = Substitute.For<ISender>();
        var pdfService = Substitute.For<IClinicDocumentPdfService>();

        var invoiceId = Guid.NewGuid();
        var invoice = new Invoice
        {
            Id = invoiceId,
            TenantId = "tenant-test",
            ClinicId = clinicId,
            InvoiceNumber = "INV-20261026-002",
            PatientName = "Artemio Dizon",
            Status = InvoiceStatus.Paid,
            GrossAmount = 700m,
            NetAmount = 700m,
            AmountPaid = 700m,
            BalanceDue = 0m,
            LineItems = new List<InvoiceLineItem>(),
            Payments = new List<PaymentRecord>
            {
                new() { PaymentNumber = "OR-20261026-002", Amount = 700m, PaymentDate = DateTime.UtcNow }
            }
        };
        await db.Invoices.AddAsync(invoice);
        await db.SaveChangesAsync();

        pdfService.GenerateOfficialReceiptPdf(Arg.Any<Invoice>(), Arg.Any<PaymentRecord?>(), Arg.Any<FacilitySettings>(), Arg.Any<StaffMember?>(), Arg.Any<Patient?>(), Arg.Any<string?>())
            .Returns(Encoding.ASCII.GetBytes("%PDF-1.4 Fake Receipt Content"));

        var controller = new BillingController(
            sender,
            pdfService,
            invoiceRepo,
            settingsRepo
        );

        var result = await controller.DownloadInvoicePdf(invoiceId, "receipt", CancellationToken.None);

        var fileResult = result.Should().BeOfType<FileContentResult>().Subject;
        fileResult.ContentType.Should().Be("application/pdf");
        fileResult.FileDownloadName.Should().Be("Receipt-OR-20261026-002.pdf");
    }
}
