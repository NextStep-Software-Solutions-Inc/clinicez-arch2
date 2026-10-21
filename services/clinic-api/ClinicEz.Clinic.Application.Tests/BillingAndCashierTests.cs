using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.Billing.Queries;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.Procedures.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Application.Features.ServicesCatalog.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class BillingAndCashierTests
{
    private readonly Guid _testClinicId = Guid.NewGuid();
    private readonly string _testTenantId = "tenant-test-01";
    private readonly IClinicContext _clinicContext;

    public BillingAndCashierTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    [Fact]
    public async Task CreateInvoice_WithSeniorCitizenDiscount_Calculates20PercentAccurately()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);

        var handler = new CreateInvoiceCommandHandler(
            invoiceRepo,
            TestDbHelper.CreateRepository<ClinicPatient>(db, sieve),
            TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve),
            unitOfWork,
            _clinicContext,
            Substitute.For<ClinicEz.Clinic.Application.Common.Interfaces.IBillingRequestPublisher>());

        var command = new CreateInvoiceCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Senior Citizen Patient",
            DiscountType: DiscountType.SeniorCitizen,
            DiscountIdNumber: "OSCA-987654",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, "CONS-GEN", "General Consultation", "Consultation", 500m, 1),
                new(null, "PROC-ECG", "12-Lead ECG", "Diagnostic", 450m, 1),
                new(null, "PROC-NEB", "Nebulization Session", "Procedure", 250m, 1)
            }
        );

        var result = await handler.Handle(command, CancellationToken.None);

        // Gross = 500 + 450 + 250 = 1200
        // Senior 20% discount = 240
        // Net = 960
        result.GrossAmount.Should().Be(1200m);
        result.DiscountPercentage.Should().Be(20m);
        result.DiscountAmount.Should().Be(240m);
        result.NetAmount.Should().Be(960m);
        result.BalanceDue.Should().Be(960m);
        result.Status.Should().Be(InvoiceStatus.Draft);
        result.InvoiceNumber.Should().StartWith("INV-");
    }

    [Fact]
    public async Task RecordPayment_FullPayment_TransitionsInvoiceStatusToPaid()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-20260929-001",
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            GrossAmount = 500m,
            NetAmount = 500m,
            BalanceDue = 500m,
            AmountPaid = 0m,
            Status = InvoiceStatus.Draft
        };
        await db.Invoices.AddAsync(invoice);
        await db.SaveChangesAsync();

        var handler = new RecordPaymentCommandHandler(invoiceRepo, unitOfWork, _clinicContext);
        var command = new RecordPaymentCommand(invoice.Id, 500m, PaymentMethod.GCash, "GCASH-REF-849201");

        var result = await handler.Handle(command, CancellationToken.None);

        result.AmountPaid.Should().Be(500m);
        result.BalanceDue.Should().Be(0m);
        result.Status.Should().Be(InvoiceStatus.Paid);
        result.Payments.Should().HaveCount(1);
        result.Payments[0].PaymentNumber.Should().StartWith("OR-");
        result.Payments[0].ReferenceNumber.Should().Be("GCASH-REF-849201");
    }

    [Fact]
    public async Task CreateClinicService_AddsToCatalogWithUniqueCode()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var serviceRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(db, sieve);

        var handler = new CreateClinicServiceItemCommandHandler(serviceRepo, unitOfWork, _clinicContext);
        var command = new CreateClinicServiceItemCommand("PROC-SUTURE", "Laceration Suture Repair", "Procedure", 750m, "Minor surgery closure");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Code.Should().Be("PROC-SUTURE");
        result.StandardPrice.Should().Be(750m);
        result.Category.Should().Be("Procedure");
    }

    [Fact]
    public async Task OrderAndExecuteProcedure_UpdatesStatusAndVitals()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(db, sieve);

        var orderHandler = new OrderProcedureCommandHandler(procRepo, unitOfWork, _clinicContext);
        var orderCmd = new OrderProcedureCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Maria Santos",
            ProcedureName: "Nebulization Therapy",
            Category: "Procedure",
            ClinicalNotes: "Administer 1 nebule Salbutamol x 15 mins"
        );
        var ordered = await orderHandler.Handle(orderCmd, CancellationToken.None);
        ordered.Status.Should().Be(ProcedureStatus.Ordered);

        var execHandler = new RecordProcedureExecutionCommandHandler(procRepo, unitOfWork, _clinicContext);
        var execCmd = new RecordProcedureExecutionCommand(
            ordered.Id,
            PerformedByStaffName: "Nurse Bea Gomez, RN",
            PreProcedureVitalsJson: "{\"SpO2\": 92}",
            PostProcedureVitalsJson: "{\"SpO2\": 99}",
            MedicationAdministered: "Salbutamol 2.5mg nebule",
            ClinicalNotes: "Breath sounds improved, wheezing resolved."
        );
        var completed = await execHandler.Handle(execCmd, CancellationToken.None);

        completed.Status.Should().Be(ProcedureStatus.Completed);
        completed.PerformedByStaffName.Should().Be("Nurse Bea Gomez, RN");
        completed.PostProcedureVitalsJson.Should().Contain("99");
    }

    [Fact]
    public async Task CreateLabOrder_GeneratesDailySequentialNumber()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);

        var handler = new CreateClinicLabOrderCommandHandler(
            orderRepo,
            patientRepo,
            TestDbHelper.CreateRepository<StaffMember>(db, sieve),
            unitOfWork,
            _clinicContext,
            Substitute.For<ClinicEz.Clinic.Application.Common.Interfaces.IClinicIdentityProvider>(),
            Substitute.For<ClinicEz.Clinic.Application.Common.Interfaces.ILabRequisitionPublisher>(),
            Phase3TestKit.Grants(db),
            Phase3TestKit.Claims(),
            Phase3TestKit.Documents(db));
        var command = new CreateClinicLabOrderCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Pedro Penduko",
            Items: new List<CreateLabOrderItemRequest>
            {
                new("Complete Blood Count (CBC)", "Hematology", "Fasting not required"),
                new("Fasting Blood Sugar (FBS)", "Clinical Chemistry", "10-12 hours fasting")
            }
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.OrderNumber.Should().StartWith("LAB-");
        result.Items.Should().HaveCount(2);
        result.Status.Should().Be(LabOrderStatus.Ordered);
    }

    [Fact]
    public async Task GetDailyEodReport_CalculatesTotalCashierCollectionsAndCensus()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(db, sieve);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var procedureRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(db, sieve);
        var labOrderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);

        var today = DateTime.UtcNow;

        // Add completed queue item
        await db.QueueItems.AddAsync(new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(today),
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Completed,
            CheckInTime = today
        });

        // Add paid invoice with cash
        var invoice = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-20260929-001",
            InvoiceDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            GrossAmount = 500m,
            NetAmount = 500m,
            AmountPaid = 500m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid
        };
        await db.Invoices.AddAsync(invoice);

        await db.Payments.AddAsync(new PaymentRecord
        {
            InvoiceId = invoice.Id,
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PaymentNumber = "OR-20260929-001",
            PaymentDate = today,
            Amount = 500m,
            Method = PaymentMethod.Cash
        });

        await db.SaveChangesAsync();

        var handler = new GetDailyEodReportQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultationRepo, procedureRepo, labOrderRepo, _clinicContext);

        var report = await handler.Handle(new GetDailyEodReportQuery(today), CancellationToken.None);

        report.TotalCheckedIn.Should().Be(1);
        report.TotalCompletedVisits.Should().Be(1);
        report.TotalGrossAmount.Should().Be(500m);
        report.TotalAmountCollected.Should().Be(500m);
        report.CashInDrawer.Should().Be(500m);
        report.CollectionsByMethod.Should().ContainSingle(c => c.Method == "Cash" && c.TotalAmount == 500m);
    }

    [Fact]
    public async Task GetInvoicesQuery_WithDate_ReturnsInvoicesCreatedOrSettledToday()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);

        var today = DateTime.UtcNow;
        var pastDate = today.AddDays(-10);

        // 1. Invoice created and paid today
        var invToday = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-TODAY-001",
            InvoiceDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Today",
            GrossAmount = 600m,
            NetAmount = 600m,
            AmountPaid = 600m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid
        };
        invToday.Payments.Add(new PaymentRecord
        {
            InvoiceId = invToday.Id,
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PaymentNumber = "OR-TODAY-001",
            PaymentDate = today,
            Amount = 600m,
            Method = PaymentMethod.Cash
        });
        await db.Invoices.AddAsync(invToday);

        // 2. Invoice created in past (e.g. yesterday draft SOA) but settled/paid TODAY
        var invPastPaidToday = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-PAST-002",
            InvoiceDate = pastDate,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Past Settled Today",
            GrossAmount = 1000m,
            NetAmount = 1000m,
            AmountPaid = 1000m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid
        };
        invPastPaidToday.Payments.Add(new PaymentRecord
        {
            InvoiceId = invPastPaidToday.Id,
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PaymentNumber = "OR-TODAY-002",
            PaymentDate = today,
            Amount = 1000m,
            Method = PaymentMethod.GCash
        });
        await db.Invoices.AddAsync(invPastPaidToday);

        // 3. Past invoice not settled today
        var invOldUnsettled = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-OLD-003",
            InvoiceDate = pastDate,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Old",
            GrossAmount = 400m,
            NetAmount = 400m,
            AmountPaid = 0m,
            BalanceDue = 400m,
            Status = InvoiceStatus.Draft
        };
        await db.Invoices.AddAsync(invOldUnsettled);

        await db.SaveChangesAsync();

        var handler = new GetInvoicesQueryHandler(invoiceRepo, _clinicContext);
        var result = await handler.Handle(new GetInvoicesQuery(Date: today), CancellationToken.None);

        result.Should().HaveCount(2);
        result.Select(i => i.InvoiceNumber).Should().Contain("INV-TODAY-001");
        result.Select(i => i.InvoiceNumber).Should().Contain("INV-PAST-002");
        result.Select(i => i.InvoiceNumber).Should().NotContain("INV-OLD-003");
    }

    [Fact]
    public async Task GetQueueQuery_WithViewAll_ReturnsBothActiveAndCompletedQueueItems()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);

        var today = DateTime.UtcNow;
        var todayDate = DateOnly.FromDateTime(today);

        await db.QueueItems.AddRangeAsync(
            new QueueItem
            {
                TenantId = _testTenantId,
                ClinicId = _testClinicId,
                QueueNumber = "Q-101",
                SequenceNumber = 1,
                QueueDate = todayDate,
                PatientId = Guid.NewGuid(),
                PatientName = "Waiting Patient",
                Priority = QueuePriority.Routine,
                Status = QueueStatus.Waiting,
                CheckInTime = today
            },
            new QueueItem
            {
                TenantId = _testTenantId,
                ClinicId = _testClinicId,
                QueueNumber = "Q-102",
                SequenceNumber = 2,
                QueueDate = todayDate,
                PatientId = Guid.NewGuid(),
                PatientName = "Triaged Patient",
                Priority = QueuePriority.Urgent,
                Status = QueueStatus.Triaged,
                CheckInTime = today
            },
            new QueueItem
            {
                TenantId = _testTenantId,
                ClinicId = _testClinicId,
                QueueNumber = "Q-103",
                SequenceNumber = 3,
                QueueDate = todayDate,
                PatientId = Guid.NewGuid(),
                PatientName = "Completed Patient",
                Priority = QueuePriority.Routine,
                Status = QueueStatus.Completed,
                CheckInTime = today
            }
        );

        await db.SaveChangesAsync();

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // 1. Default view excludes Completed
        var defaultQueue = await handler.Handle(new GetQueueQuery(Date: todayDate), CancellationToken.None);
        defaultQueue.Should().HaveCount(2);
        defaultQueue.Select(q => q.Status).Should().NotContain(QueueStatus.Completed);

        // 2. View = "All" includes Completed
        var allQueue = await handler.Handle(new GetQueueQuery(Date: todayDate, View: "All"), CancellationToken.None);
        allQueue.Should().HaveCount(3);
        allQueue.Select(q => q.Status).Should().Contain(QueueStatus.Completed);
    }
}
