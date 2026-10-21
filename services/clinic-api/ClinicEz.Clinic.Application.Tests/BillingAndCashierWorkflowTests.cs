using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
using ClinicEz.Clinic.Application.Features.Billing.Queries;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>
/// Comprehensive opaque-box E2E test suite covering multi-doctor billing, draft SOA merging,
/// line-item clinician attribution, clean removal of AttendingDoctorName, cross-date draft retrieval,
/// document separation (INV-... vs OR-...), defensive cashiering, and promissory notes.
/// Organised across 4 systematic verification tiers.
/// </summary>
public class BillingAndCashierWorkflowTests
{
    private readonly Guid _testClinicId = Guid.NewGuid();
    private readonly string _testTenantId = "tenant-e2e-workflow";
    private readonly IClinicContext _clinicContext;

    public BillingAndCashierWorkflowTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    #region Reflection & Factory Helpers

    private static CreateInvoiceLineItemRequest CreateLineItem(
        Guid? doctorId,
        string? doctorName,
        Guid? serviceItemId,
        string? itemCode,
        string description,
        string category,
        decimal unitPrice,
        int quantity)
    {
        var type = typeof(CreateInvoiceLineItemRequest);

        // Check for 8-parameter constructor: (DoctorId, DoctorName, ServiceItemId, ItemCode, Description, Category, UnitPrice, Quantity)
        var ctor8 = type.GetConstructors().FirstOrDefault(c => c.GetParameters().Length == 8);
        if (ctor8 != null)
        {
            var p = ctor8.GetParameters();
            if (p[0].Name?.Equals("DoctorId", StringComparison.OrdinalIgnoreCase) == true)
            {
                return (CreateInvoiceLineItemRequest)ctor8.Invoke(new object?[]
                {
                    doctorId, doctorName, serviceItemId, itemCode, description, category, unitPrice, quantity
                });
            }
        }

        // Check for 6-parameter constructor: (ServiceItemId, ItemCode, Description, Category, UnitPrice, Quantity)
        var ctor6 = type.GetConstructors().FirstOrDefault(c => c.GetParameters().Length == 6);
        if (ctor6 != null)
        {
            var item = (CreateInvoiceLineItemRequest)ctor6.Invoke(new object?[]
            {
                serviceItemId, itemCode, description, category, unitPrice, quantity
            });
            type.GetProperty("DoctorId")?.SetValue(item, doctorId);
            type.GetProperty("DoctorName")?.SetValue(item, doctorName);
            return item;
        }

        throw new InvalidOperationException("Could not find matching constructor for CreateInvoiceLineItemRequest");
    }

    private static (Guid? DoctorId, string? DoctorName) GetDoctorInfo(InvoiceLineItemDto dto)
    {
        var doctorIdProp = typeof(InvoiceLineItemDto).GetProperty("DoctorId");
        var doctorNameProp = typeof(InvoiceLineItemDto).GetProperty("DoctorName");
        var doctorId = (Guid?)doctorIdProp?.GetValue(dto);
        var doctorName = (string?)doctorNameProp?.GetValue(dto);
        return (doctorId, doctorName);
    }

    private static (Guid? DoctorId, string? DoctorName) GetDoctorInfo(InvoiceLineItem item)
    {
        var doctorIdProp = typeof(InvoiceLineItem).GetProperty("DoctorId");
        var doctorNameProp = typeof(InvoiceLineItem).GetProperty("DoctorName");
        var doctorId = (Guid?)doctorIdProp?.GetValue(item);
        var doctorName = (string?)doctorNameProp?.GetValue(item);
        return (doctorId, doctorName);
    }

    private static void SetDoctorInfo(InvoiceLineItem item, Guid? doctorId, string? doctorName)
    {
        typeof(InvoiceLineItem).GetProperty("DoctorId")?.SetValue(item, doctorId);
        typeof(InvoiceLineItem).GetProperty("DoctorName")?.SetValue(item, doctorName);
    }

    #endregion

    #region Tier 1: Feature Coverage (Core Requirements)

    [Fact]
    public void Tier1_01_Contract_InvoiceLineItem_EntityAndDto_ContainClinicianAttribution()
    {
        // R2 Requirement: InvoiceLineItem entity, DTOs, and requests must include DoctorId and DoctorName
        typeof(InvoiceLineItem).GetProperty("DoctorId").Should().NotBeNull(
            "InvoiceLineItem entity must declare DoctorId (Guid?) for line-item clinician attribution.");
        typeof(InvoiceLineItem).GetProperty("DoctorName").Should().NotBeNull(
            "InvoiceLineItem entity must declare DoctorName (string?) for line-item clinician attribution.");

        typeof(InvoiceLineItemDto).GetProperty("DoctorId").Should().NotBeNull(
            "InvoiceLineItemDto must declare DoctorId (Guid?) for frontend display.");
        typeof(InvoiceLineItemDto).GetProperty("DoctorName").Should().NotBeNull(
            "InvoiceLineItemDto must declare DoctorName (string?) for frontend display.");

        typeof(CreateInvoiceLineItemRequest).GetProperty("DoctorId").Should().NotBeNull(
            "CreateInvoiceLineItemRequest must declare DoctorId for charge capture.");
        typeof(CreateInvoiceLineItemRequest).GetProperty("DoctorName").Should().NotBeNull(
            "CreateInvoiceLineItemRequest must declare DoctorName for charge capture.");
    }

    [Fact]
    public void Tier1_02_Contract_Invoice_CleanlyRemovesAttendingDoctorName()
    {
        // R2 Requirement: Clean removal of AttendingDoctorName on Invoice entity, DTOs, and requests
        typeof(Invoice).GetProperty("AttendingDoctorName").Should().BeNull(
            "AttendingDoctorName must be cleanly removed from Invoice domain entity as charges belong to clinicians per line item.");
        typeof(InvoiceDto).GetProperty("AttendingDoctorName").Should().BeNull(
            "AttendingDoctorName must be cleanly removed from InvoiceDto.");
        typeof(CreateInvoiceRequest).GetProperty("AttendingDoctorName").Should().BeNull(
            "AttendingDoctorName must be cleanly removed from CreateInvoiceRequest.");
    }

    [Fact]
    public async Task Tier1_03_MultiDoctor_DraftInvoiceMerging_AppendsLineItems_WithoutConflict()
    {
        // R1 Requirement: Doctor 1 charges + Doctor 2 charges for same queue encounter merge cleanly
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var handler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, unitOfWork, _clinicContext, publisher);

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();
        var doctor1Id = Guid.NewGuid();
        var doctor2Id = Guid.NewGuid();

        // Doctor 1 (Dr. Wave Ambray) signs consultation encounter
        var command1 = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Rosanna Roces",
            QueueItemId: queueItemId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(doctor1Id, "Dr. Wave Ambray", null, "CONS-GEN", "General Medical Consultation", "Consultation", 500m, 1)
            }
        );

        var firstResult = await handler.Handle(command1, CancellationToken.None);
        firstResult.Status.Should().Be(InvoiceStatus.Draft);
        firstResult.GrossAmount.Should().Be(500m);
        firstResult.LineItems.Should().HaveCount(1);

        // Doctor 2 (Dr. Allan Santos) executes and signs a procedure for the same patient visit
        var command2 = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Rosanna Roces",
            QueueItemId: queueItemId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(doctor2Id, "Dr. Allan Santos", null, "PROC-RESTORE", "Tooth Restoration Composite", "Procedure", 1500m, 1)
            }
        );

        // Must NOT throw 409 ConflictException!
        var mergedResult = await handler.Handle(command2, CancellationToken.None);

        mergedResult.Id.Should().Be(firstResult.Id);
        mergedResult.InvoiceNumber.Should().Be(firstResult.InvoiceNumber);
        mergedResult.Status.Should().Be(InvoiceStatus.Draft);
        mergedResult.LineItems.Should().HaveCount(2);

        // Verify line item 1
        var item1 = mergedResult.LineItems[0];
        item1.Description.Should().Be("General Medical Consultation");
        item1.TotalPrice.Should().Be(500m);
        var (doc1Id, doc1Name) = GetDoctorInfo(item1);
        doc1Name.Should().Be("Dr. Wave Ambray");

        // Verify line item 2
        var item2 = mergedResult.LineItems[1];
        item2.Description.Should().Be("Tooth Restoration Composite");
        item2.TotalPrice.Should().Be(1500m);
        var (doc2Id, doc2Name) = GetDoctorInfo(item2);
        doc2Name.Should().Be("Dr. Allan Santos");

        // Totals recalculated accurately
        mergedResult.GrossAmount.Should().Be(2000m);
        mergedResult.NetAmount.Should().Be(2000m);
        mergedResult.BalanceDue.Should().Be(2000m);
    }

    [Fact]
    public async Task Tier1_04_PaidInvoice_StrictDuplicateBlocking_ThrowsConflictException()
    {
        // R1 Requirement: Strict duplicate blocking applies if existing invoice is Paid and AllowDuplicate is false
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var queueItemId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var paidInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-20261021-001",
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            QueueItemId = queueItemId,
            Status = InvoiceStatus.Paid,
            GrossAmount = 800m,
            NetAmount = 800m,
            AmountPaid = 800m,
            BalanceDue = 0m
        };
        await db.Invoices.AddAsync(paidInvoice);
        await db.SaveChangesAsync();

        var handler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, unitOfWork, _clinicContext, publisher);
        var command = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Juan Dela Cruz",
            QueueItemId: queueItemId,
            AllowDuplicate: false
        );

        var act = async () => await handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("*already been generated*");
    }

    [Fact]
    public async Task Tier1_05_PaidInvoice_AllowDuplicateTrue_GeneratesSecondInvoice()
    {
        // R1 Requirement: AllowDuplicate = true allows subsequent billing
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var queueItemId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var paidInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-20261021-001",
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            QueueItemId = queueItemId,
            Status = InvoiceStatus.Paid,
            GrossAmount = 500m,
            NetAmount = 500m,
            AmountPaid = 500m,
            BalanceDue = 0m
        };
        await db.Invoices.AddAsync(paidInvoice);
        await db.SaveChangesAsync();

        var handler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, unitOfWork, _clinicContext, publisher);
        var command = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Juan Dela Cruz",
            QueueItemId: queueItemId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(null, null, null, "MED-01", "Amoxicillin 500mg Capsule", "Pharmacy", 150m, 10)
            },
            AllowDuplicate: true
        );

        var result = await handler.Handle(command, CancellationToken.None);
        result.Id.Should().NotBe(paidInvoice.Id);
        result.InvoiceNumber.Should().NotBe(paidInvoice.InvoiceNumber);
        result.Status.Should().Be(InvoiceStatus.Draft);
        result.GrossAmount.Should().Be(1500m);
    }

    [Fact]
    public async Task Tier1_06_CrossDateDraftRetrieval_ReturnsAllDrafts_WhenDateIsNull()
    {
        // R4 Acceptance Criteria: GetInvoicesQuery supports fetching open Draft invoices across date boundaries when Status == Draft and Date == null
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);

        var yesterday = DateTime.UtcNow.AddDays(-1);
        var today = DateTime.UtcNow;

        var draftYesterday = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-YESTERDAY-001",
            InvoiceDate = yesterday,
            PatientId = Guid.NewGuid(),
            PatientName = "Yesterday Nightshift Patient",
            Status = InvoiceStatus.Draft,
            GrossAmount = 600m,
            NetAmount = 600m,
            BalanceDue = 600m
        };

        var draftToday = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-TODAY-001",
            InvoiceDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Today Morning Patient",
            Status = InvoiceStatus.Draft,
            GrossAmount = 750m,
            NetAmount = 750m,
            BalanceDue = 750m
        };

        var paidYesterday = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-PAID-001",
            InvoiceDate = yesterday,
            PatientId = Guid.NewGuid(),
            PatientName = "Settled Patient Yesterday",
            Status = InvoiceStatus.Paid,
            GrossAmount = 500m,
            NetAmount = 500m,
            AmountPaid = 500m,
            BalanceDue = 0m
        };

        await db.Invoices.AddRangeAsync(draftYesterday, draftToday, paidYesterday);
        await db.SaveChangesAsync();

        var handler = new GetInvoicesQueryHandler(invoiceRepo, _clinicContext);
        var query = new GetInvoicesQuery(Date: null, Status: InvoiceStatus.Draft);

        var results = await handler.Handle(query, CancellationToken.None);

        results.Should().HaveCount(2);
        results.Select(i => i.InvoiceNumber).Should().Contain(new[] { "INV-YESTERDAY-001", "INV-TODAY-001" });
        results.Select(i => i.InvoiceNumber).Should().NotContain("INV-PAID-001");
    }

    [Fact]
    public async Task Tier1_07_DoctorShares_CalculatesRevenue_PerClinicianLineItem()
    {
        // R2 Requirement: GetDoctorSharesReportQuery computes doctor revenue share accurately based on line-item clinician attribution
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(db, sieve);

        var docAId = Guid.NewGuid();
        var docAName = "Dr. Wave Ambray";
        var docBId = Guid.NewGuid();
        var docBName = "Dr. Allan Santos";

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-20261021-SHARE",
            InvoiceDate = DateTime.UtcNow,
            PatientId = Guid.NewGuid(),
            PatientName = "Shared Care Patient",
            GrossAmount = 2000m,
            NetAmount = 2000m,
            Status = InvoiceStatus.Paid,
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    Description = "General Consultation",
                    Category = "Consultation",
                    UnitPrice = 500m,
                    Quantity = 1,
                    TotalPrice = 500m
                },
                new()
                {
                    Description = "Tooth Restoration",
                    Category = "Procedure",
                    UnitPrice = 1500m,
                    Quantity = 1,
                    TotalPrice = 1500m
                }
            }
        };

        SetDoctorInfo(invoice.LineItems[0], docAId, docAName);
        SetDoctorInfo(invoice.LineItems[1], docBId, docBName);

        await db.Invoices.AddAsync(invoice);
        await db.SaveChangesAsync();

        var handler = new GetDoctorSharesReportQueryHandler(consultRepo, invoiceRepo, procRepo, _clinicContext);
        var query = new GetDoctorSharesReportQuery(StartDate: DateTime.UtcNow.AddDays(-7), EndDate: DateTime.UtcNow.AddDays(1));

        var report = await handler.Handle(query, CancellationToken.None);

        report.Should().NotBeNull();
        // If query uses line items, each doctor receives their exact share
        var doctorAShare = report.DoctorShares.FirstOrDefault(d => d.DoctorName.Contains("Wave Ambray") || d.DoctorId == docAId.ToString());
        var doctorBShare = report.DoctorShares.FirstOrDefault(d => d.DoctorName.Contains("Allan Santos") || d.DoctorId == docBId.ToString());

        doctorAShare.Should().NotBeNull("Doctor A share should be present in the report");
        doctorBShare.Should().NotBeNull("Doctor B share should be present in the report");
        doctorAShare!.TotalConsultationGross.Should().Be(500m);
        doctorBShare!.TotalProcedureGross.Should().Be(1500m);
    }

    [Fact]
    public async Task Tier1_08_DocumentSeparation_InvoiceNumberPrefix_And_PaymentNumberPrefix()
    {
        // R3 Requirement: Clear separation between SOA (INV-...) and Official Receipt (OR-...)
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var createHandler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, unitOfWork, _clinicContext, publisher);
        var invoice = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Patient Document Test",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(null, null, null, "CONS-01", "Consultation", "Consultation", 500m, 1)
            }
        ), CancellationToken.None);

        invoice.InvoiceNumber.Should().StartWith("INV-", "SOA must use INV- prefix");

        var paymentHandler = new RecordPaymentCommandHandler(invoiceRepo, unitOfWork, _clinicContext);
        var paymentResult = await paymentHandler.Handle(new RecordPaymentCommand(
            InvoiceId: invoice.Id,
            Amount: 500m,
            Method: PaymentMethod.Cash
        ), CancellationToken.None);

        paymentResult.Payments.Should().HaveCount(1);
        paymentResult.Payments[0].PaymentNumber.Should().StartWith("OR-", "Official Receipt must use OR- prefix");
    }

    #endregion

    #region Tier 2: Boundary & Corner Cases

    [Fact]
    public async Task Tier2_01_Boundary_EmptyLineItems_MergesGracefullyWithoutCorruptingTotals()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var handler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, unitOfWork, _clinicContext, publisher);
        var queueId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // Initial draft with 1 item
        var initial = await handler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Empty Merge Patient",
            QueueItemId: queueId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(null, null, null, "ITEM-1", "Basic Service", "Service", 300m, 1)
            }
        ), CancellationToken.None);

        initial.GrossAmount.Should().Be(300m);

        // Merging empty list
        var merged = await handler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Empty Merge Patient",
            QueueItemId: queueId,
            LineItems: new List<CreateInvoiceLineItemRequest>()
        ), CancellationToken.None);

        merged.GrossAmount.Should().Be(300m);
        merged.LineItems.Should().HaveCount(1);
    }

    [Fact]
    public async Task Tier2_02_Boundary_MultipleCharges_WithDifferentDiscounts_CalculatesAccurately()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var handler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, unitOfWork, _clinicContext, publisher);
        var queueId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // Initial charge without discount
        await handler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Senior Citizen Boundary",
            QueueItemId: queueId,
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(null, null, null, "CONS", "Consultation", "Consultation", 1000m, 1)
            }
        ), CancellationToken.None);

        // Second charge applies Senior Citizen 20%
        var merged = await handler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Senior Citizen Boundary",
            QueueItemId: queueId,
            DiscountType: DiscountType.SeniorCitizen,
            DiscountIdNumber: "OSCA-998877",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(null, null, null, "PROC", "Minor Procedure", "Procedure", 500m, 1)
            }
        ), CancellationToken.None);

        // Gross = 1000 + 500 = 1500
        // Senior 20% = 300
        // Net = 1200
        merged.GrossAmount.Should().Be(1500m);
        merged.DiscountPercentage.Should().Be(20m);
        merged.DiscountAmount.Should().Be(300m);
        merged.NetAmount.Should().Be(1200m);
        merged.BalanceDue.Should().Be(1200m);
    }

    [Fact]
    public async Task Tier2_03_Boundary_ZeroBalanceDraft_PhilHealthPackage_ThenAddsBillableProcedure()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var handler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, unitOfWork, _clinicContext, publisher);
        var queueId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // 100% PhilHealth package consultation
        var initial = await handler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Konsulta Package Patient",
            QueueItemId: queueId,
            DiscountType: DiscountType.PhilHealthKonsulta,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(null, null, null, "KONSULTA-01", "PhilHealth Konsulta Initial Encounter", "Consultation", 500m, 1)
            }
        ), CancellationToken.None);

        initial.GrossAmount.Should().Be(500m);
        initial.NetAmount.Should().Be(0m);
        initial.BalanceDue.Should().Be(0m);

        // Add billable out-of-package procedure
        var merged = await handler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Konsulta Package Patient",
            QueueItemId: queueId,
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(null, null, null, "PROC-DERM", "Specialized Skin Biopsy", "Procedure", 750m, 1)
            }
        ), CancellationToken.None);

        merged.GrossAmount.Should().Be(1250m);
        merged.NetAmount.Should().Be(750m);
        merged.BalanceDue.Should().Be(750m);
    }

    [Fact]
    public async Task Tier2_04_Boundary_PartialPayment_ThenAdditionalDoctorCharge_PreservesAmountPaid()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var createHandler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, unitOfWork, _clinicContext, publisher);
        var paymentHandler = new RecordPaymentCommandHandler(invoiceRepo, unitOfWork, _clinicContext);

        var queueId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // Draft invoice ₱1,000
        var invoice = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Partial Payment Boundary",
            QueueItemId: queueId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(null, null, null, "CONS", "Initial Consult", "Consultation", 1000m, 1)
            }
        ), CancellationToken.None);

        // Pay ₱400 partially
        var partial = await paymentHandler.Handle(new RecordPaymentCommand(
            InvoiceId: invoice.Id,
            Amount: 400m,
            Method: PaymentMethod.Cash
        ), CancellationToken.None);

        partial.Status.Should().Be(InvoiceStatus.PartiallyPaid);
        partial.AmountPaid.Should().Be(400m);
        partial.BalanceDue.Should().Be(600m);

        // Second doctor adds ₱500 procedure
        var updated = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Partial Payment Boundary",
            QueueItemId: queueId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(null, null, null, "PROC", "Additional Treatment", "Procedure", 500m, 1)
            }
        ), CancellationToken.None);

        // Gross = 1500, AmountPaid remains 400, BalanceDue = 1500 - 400 = 1100
        updated.GrossAmount.Should().Be(1500m);
        updated.NetAmount.Should().Be(1500m);
        updated.AmountPaid.Should().Be(400m, "Previously collected payment must NOT be wiped out on charge merge!");
        updated.BalanceDue.Should().Be(1100m, "Balance due must equal NetAmount minus AmountPaid.");
        updated.Status.Should().Be(InvoiceStatus.PartiallyPaid);
    }

    [Fact]
    public async Task Tier2_05_Boundary_CrossMidnight_DraftRetrieval_SpansDateBoundary()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);

        // Yesterday 23:59:58 UTC
        var lateNightYesterday = DateTime.UtcNow.Date.AddSeconds(-2);
        var lateNightDraft = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-NIGHT-59",
            InvoiceDate = lateNightYesterday,
            PatientId = Guid.NewGuid(),
            PatientName = "Late Night Patient",
            Status = InvoiceStatus.Draft,
            GrossAmount = 450m,
            NetAmount = 450m,
            BalanceDue = 450m
        };
        await db.Invoices.AddAsync(lateNightDraft);
        await db.SaveChangesAsync();

        var queryHandler = new GetInvoicesQueryHandler(invoiceRepo, _clinicContext);
        var result = await queryHandler.Handle(new GetInvoicesQuery(Date: null, Status: InvoiceStatus.Draft), CancellationToken.None);

        result.Should().ContainSingle(i => i.InvoiceNumber == "INV-NIGHT-59");
    }

    [Fact]
    public async Task Tier2_06_Boundary_ExactFullPayment_TransitionsToPaid_WithZeroBalance()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-EXACT-001",
            PatientId = Guid.NewGuid(),
            PatientName = "Exact Settlement Patient",
            GrossAmount = 1450.75m,
            NetAmount = 1450.75m,
            BalanceDue = 1450.75m,
            AmountPaid = 0m,
            Status = InvoiceStatus.Draft
        };
        await db.Invoices.AddAsync(invoice);
        await db.SaveChangesAsync();

        var paymentHandler = new RecordPaymentCommandHandler(invoiceRepo, unitOfWork, _clinicContext);
        var paidResult = await paymentHandler.Handle(new RecordPaymentCommand(
            InvoiceId: invoice.Id,
            Amount: 1450.75m,
            Method: PaymentMethod.CreditCard,
            ReferenceNumber: "AUTH-88291"
        ), CancellationToken.None);

        paidResult.Status.Should().Be(InvoiceStatus.Paid);
        paidResult.BalanceDue.Should().Be(0m);
        paidResult.AmountPaid.Should().Be(1450.75m);
        paidResult.Payments[0].PaymentNumber.Should().StartWith("OR-");
    }

    #endregion

    #region Tier 3: Cross-Feature Combinations

    [Fact]
    public async Task Tier3_01_CrossFeature_MultiDoctor_ChargeMerge_CashierEdit_SeniorDiscount_PromissoryNote_Settlement()
    {
        // Full lifecycle covering features R1, R2, R3, R4, R5
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var createHandler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, unitOfWork, _clinicContext, publisher);
        var updateHandler = new UpdateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, unitOfWork, _clinicContext, publisher);
        var paymentHandler = new RecordPaymentCommandHandler(invoiceRepo, unitOfWork, _clinicContext);
        var queryHandler = new GetInvoicesQueryHandler(invoiceRepo, _clinicContext);

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();
        var doc1Id = Guid.NewGuid();
        var doc2Id = Guid.NewGuid();

        // 1. Doctor 1 (Dr. Wave) conducts Consultation
        var step1 = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Corazon Aquino",
            QueueItemId: queueItemId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(doc1Id, "Dr. Wave Ambray", null, "CONS-01", "Comprehensive Consultation", "Consultation", 500m, 1)
            }
        ), CancellationToken.None);

        step1.GrossAmount.Should().Be(500m);

        // 2. Doctor 2 (Dr. Allan) executes procedure
        var step2 = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Corazon Aquino",
            QueueItemId: queueItemId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(doc2Id, "Dr. Allan Santos", null, "PROC-NEB", "Nebulization Session", "Procedure", 350m, 1)
            }
        ), CancellationToken.None);

        step2.GrossAmount.Should().Be(850m);
        step2.LineItems.Should().HaveCount(2);

        // 3. Cashier defensive edit: modifies Nebulization quantity to 2
        var step3 = await updateHandler.Handle(new UpdateInvoiceCommand(
            InvoiceId: step2.Id,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(doc1Id, "Dr. Wave Ambray", null, "CONS-01", "Comprehensive Consultation", "Consultation", 500m, 1),
                CreateLineItem(doc2Id, "Dr. Allan Santos", null, "PROC-NEB", "Nebulization Session", "Procedure", 350m, 2)
            }
        ), CancellationToken.None);

        // Gross = 500 + (350 * 2) = 1200
        step3.GrossAmount.Should().Be(1200m);

        // 4. Cashier applies Senior Citizen 20% discount
        var step4 = await updateHandler.Handle(new UpdateInvoiceCommand(
            InvoiceId: step2.Id,
            DiscountType: DiscountType.SeniorCitizen,
            DiscountIdNumber: "OSCA-PASIG-2026-0012",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(doc1Id, "Dr. Wave Ambray", null, "CONS-01", "Comprehensive Consultation", "Consultation", 500m, 1),
                CreateLineItem(doc2Id, "Dr. Allan Santos", null, "PROC-NEB", "Nebulization Session", "Procedure", 350m, 2)
            }
        ), CancellationToken.None);

        // Net = 1200 - 240 = 960
        step4.DiscountAmount.Should().Be(240m);
        step4.NetAmount.Should().Be(960m);
        step4.BalanceDue.Should().Be(960m);

        // 5. Patient cannot settle today; Cashier enters Promissory Note
        var promissoryNote = "Promissory note signed: Due in 7 days upon GSIS pension disbursement.";
        var step5 = await updateHandler.Handle(new UpdateInvoiceCommand(
            InvoiceId: step2.Id,
            Notes: promissoryNote
        ), CancellationToken.None);

        step5.Notes.Should().Contain("Promissory note signed");
        step5.Status.Should().Be(InvoiceStatus.Draft);

        // 6. Days later, cashier retrieves open drafts across date boundary
        var openDrafts = await queryHandler.Handle(new GetInvoicesQuery(Date: null, Status: InvoiceStatus.Draft), CancellationToken.None);
        var retrieved = openDrafts.FirstOrDefault(i => i.Id == step2.Id);
        retrieved.Should().NotBeNull();
        retrieved!.BalanceDue.Should().Be(960m);

        // 7. Patient returns and settles full ₱960 via GCash
        var settled = await paymentHandler.Handle(new RecordPaymentCommand(
            InvoiceId: step2.Id,
            Amount: 960m,
            Method: PaymentMethod.GCash,
            ReferenceNumber: "GCASH-SETTLE-881902"
        ), CancellationToken.None);

        settled.Status.Should().Be(InvoiceStatus.Paid);
        settled.BalanceDue.Should().Be(0m);
        settled.AmountPaid.Should().Be(960m);
        settled.Payments[0].PaymentNumber.Should().StartWith("OR-");
    }

    #endregion

    #region Tier 4: Real-World Scenarios

    [Fact]
    public async Task Tier4_01_RealWorld_MultiSpecialtyClinicDay_TriagedPatient_MultiDepartmentBilling()
    {
        // Real-world outpatient clinic day scenario:
        // Triaged patient visits General Medicine, then Dental Department, then Laboratory,
        // gets PWD 20% discount, and completes checkout via split payment.
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(db, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(db, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var createHandler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, unitOfWork, _clinicContext, publisher);
        var updateHandler = new UpdateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, unitOfWork, _clinicContext, publisher);
        var paymentHandler = new RecordPaymentCommandHandler(invoiceRepo, unitOfWork, _clinicContext);

        var queueId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var drWaveId = Guid.NewGuid();
        var drBeatriceId = Guid.NewGuid();

        // 09:00 General Medicine Consultation
        await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Juan Dela Cruz",
            QueueItemId: queueId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(drWaveId, "Dr. Wave Ambray", null, "CONS-GEN", "General Health Consultation", "Consultation", 600m, 1)
            }
        ), CancellationToken.None);

        // 10:30 Dental Tooth Restoration
        await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Juan Dela Cruz",
            QueueItemId: queueId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(drBeatriceId, "Dr. Beatrice Reyes", null, "DENT-REST", "Light-Cure Composite Restoration", "Procedure", 1800m, 1)
            }
        ), CancellationToken.None);

        // 11:15 In-House Laboratory Urinalysis
        var consolidated = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Juan Dela Cruz",
            QueueItemId: queueId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(null, null, null, "LAB-URI", "Urinalysis Routine", "Laboratory", 250m, 1)
            }
        ), CancellationToken.None);

        // Gross = 600 + 1800 + 250 = 2650
        consolidated.GrossAmount.Should().Be(2650m);
        consolidated.LineItems.Should().HaveCount(3);

        // Apply PWD 20% discount
        var discounted = await updateHandler.Handle(new UpdateInvoiceCommand(
            InvoiceId: consolidated.Id,
            DiscountType: DiscountType.Pwd,
            DiscountIdNumber: "PWD-QC-2026-88719",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                CreateLineItem(drWaveId, "Dr. Wave Ambray", null, "CONS-GEN", "General Health Consultation", "Consultation", 600m, 1),
                CreateLineItem(drBeatriceId, "Dr. Beatrice Reyes", null, "DENT-REST", "Light-Cure Composite Restoration", "Procedure", 1800m, 1),
                CreateLineItem(null, null, null, "LAB-URI", "Urinalysis Routine", "Laboratory", 250m, 1)
            }
        ), CancellationToken.None);

        // Gross 2650, Discount 20% = 530, Net = 2120
        discounted.DiscountAmount.Should().Be(530m);
        discounted.NetAmount.Should().Be(2120m);
        discounted.BalanceDue.Should().Be(2120m);

        // Split Payment:
        // Payment 1: ₱1,000 Cash
        var split1 = await paymentHandler.Handle(new RecordPaymentCommand(
            InvoiceId: consolidated.Id,
            Amount: 1000m,
            Method: PaymentMethod.Cash
        ), CancellationToken.None);

        split1.Status.Should().Be(InvoiceStatus.PartiallyPaid);
        split1.AmountPaid.Should().Be(1000m);
        split1.BalanceDue.Should().Be(1120m);
        split1.Payments[0].PaymentNumber.Should().StartWith("OR-");

        // Payment 2: ₱1,120 Maya Digital Wallet
        var split2 = await paymentHandler.Handle(new RecordPaymentCommand(
            InvoiceId: consolidated.Id,
            Amount: 1120m,
            Method: PaymentMethod.Maya,
            ReferenceNumber: "MAYA-20261021-9921"
        ), CancellationToken.None);

        split2.Status.Should().Be(InvoiceStatus.Paid);
        split2.AmountPaid.Should().Be(2120m);
        split2.BalanceDue.Should().Be(0m);
        split2.Payments.Should().HaveCount(2);
        split2.Payments[1].PaymentNumber.Should().StartWith("OR-");
        split2.Payments[0].PaymentNumber.Should().NotBe(split2.Payments[1].PaymentNumber);
    }

    [Fact]
    public void SystemTextJson_Must_Deserialize_CreateInvoiceLineItemRequest_And_Commands_Without_Constructor_Ambiguity()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
        };

        // 1. Deserializing individual CreateInvoiceLineItemRequest
        const string lineItemJson = """
        {
            "doctorId": "22222222-2222-2222-2222-222222222222",
            "doctorName": "Dr. Allan Santos",
            "serviceItemId": "33333333-3333-3333-3333-333333333333",
            "itemCode": "DENT-CLEAN",
            "description": "Dental Oral Prophylaxis",
            "category": "Procedure",
            "unitPrice": 1200.50,
            "quantity": 2
        }
        """;

        var lineItem = JsonSerializer.Deserialize<CreateInvoiceLineItemRequest>(lineItemJson, options);
        lineItem.Should().NotBeNull();
        lineItem!.DoctorId.Should().Be(Guid.Parse("22222222-2222-2222-2222-222222222222"));
        lineItem.DoctorName.Should().Be("Dr. Allan Santos");
        lineItem.ItemCode.Should().Be("DENT-CLEAN");
        lineItem.Description.Should().Be("Dental Oral Prophylaxis");
        lineItem.Category.Should().Be("Procedure");
        lineItem.UnitPrice.Should().Be(1200.50m);
        lineItem.Quantity.Should().Be(2);

        // 2. Deserializing CreateInvoiceRequest with lineItems
        const string createInvoiceJson = """
        {
            "patientId": "11111111-1111-1111-1111-111111111111",
            "patientName": "Juan Dela Cruz",
            "discountType": "None",
            "lineItems": [
                {
                    "doctorId": "22222222-2222-2222-2222-222222222222",
                    "doctorName": "Dr. Allan Santos",
                    "description": "Dental Cleaning",
                    "category": "Procedure",
                    "unitPrice": 1200.0,
                    "quantity": 1
                }
            ]
        }
        """;

        var createReq = JsonSerializer.Deserialize<CreateInvoiceRequest>(createInvoiceJson, options);
        createReq.Should().NotBeNull();
        createReq!.LineItems.Should().HaveCount(1);
        createReq.LineItems[0].DoctorName.Should().Be("Dr. Allan Santos");

        // 3. Deserializing UpdateInvoiceRequest with lineItems
        const string updateInvoiceJson = """
        {
            "discountType": "SeniorCitizen",
            "discountIdNumber": "SC-12345",
            "lineItems": [
                {
                    "description": "General Consultation",
                    "category": "Consultation",
                    "unitPrice": 500.0,
                    "quantity": 1
                }
            ]
        }
        """;

        var updateReq = JsonSerializer.Deserialize<UpdateInvoiceRequest>(updateInvoiceJson, options);
        updateReq.Should().NotBeNull();
        updateReq!.LineItems.Should().HaveCount(1);
        updateReq.LineItems![0].Description.Should().Be("General Consultation");
    }

    #endregion
}
