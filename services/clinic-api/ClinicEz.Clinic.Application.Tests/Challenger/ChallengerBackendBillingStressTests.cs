using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Billing.Commands;
using ClinicEz.Clinic.Application.Features.Billing.DTOs;
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

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Empirical Adversarial Challenger Test Suite:
/// Backend Billing Concurrency, Duplicate Prevention, Multi-Doctor Merging & Doctor Shares Revenue Attribution.
/// </summary>
public class ChallengerBackendBillingStressTests
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

    #region Challenge 1: Multi-Doctor Charge Merging Edge Cases

    [Fact]
    public async Task Challenge1_1_ThreeDoctors_SequentialMerge_PreservesAllSixLineItems_WithAttribution()
    {
        // Scenario: Doctor A adds 3 items, Doctor B adds 2 items, Doctor C adds 1 item to the same queue encounter.
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var handler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, uow, clinicContext, publisher);

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();
        var docAId = Guid.NewGuid();
        var docAName = "Dr. Alice Ramos";
        var docBId = Guid.NewGuid();
        var docBName = "Dr. Bob Santos";
        var docCId = Guid.NewGuid();
        var docCName = "Dr. Carol Diaz";

        // Doctor A adds 3 items
        var docACmd = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Patient Multi-Doctor",
            QueueItemId: queueItemId,
            AttendingDoctorId: docAId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(docAId, docAName, null, "CONS-01", "Initial Consultation", "Consultation", 500m, 1),
                new(docAId, docAName, null, "PROC-01", "Wound Dressing", "Procedure", 300m, 1),
                new(docAId, docAName, null, "MED-01", "Tetanus Toxoid Injection", "Medication", 200m, 1)
            }
        );
        var inv1 = await handler.Handle(docACmd, CancellationToken.None);
        inv1.LineItems.Should().HaveCount(3);
        inv1.GrossAmount.Should().Be(1000m);
        inv1.Status.Should().Be(InvoiceStatus.Draft);

        // Doctor B adds 2 items to the same encounter
        var docBCmd = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Patient Multi-Doctor",
            QueueItemId: queueItemId,
            AttendingDoctorId: docBId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(docBId, docBName, null, "DENT-01", "Dental Examination", "Consultation", 400m, 1),
                new(docBId, docBName, null, "DENT-02", "Tooth Restoration", "Procedure", 1500m, 1)
            }
        );
        var inv2 = await handler.Handle(docBCmd, CancellationToken.None);
        inv2.Id.Should().Be(inv1.Id);
        inv2.InvoiceNumber.Should().Be(inv1.InvoiceNumber);
        inv2.LineItems.Should().HaveCount(5);
        inv2.GrossAmount.Should().Be(2900m);
        inv2.BalanceDue.Should().Be(2900m);

        // Doctor C adds 1 item to the same encounter
        var docCCmd = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Patient Multi-Doctor",
            QueueItemId: queueItemId,
            AttendingDoctorId: docCId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(docCId, docCName, null, "PT-01", "Physical Therapy Session", "Procedure", 800m, 1)
            }
        );
        var inv3 = await handler.Handle(docCCmd, CancellationToken.None);
        inv3.Id.Should().Be(inv1.Id);
        inv3.LineItems.Should().HaveCount(6);
        inv3.GrossAmount.Should().Be(3700m);
        inv3.NetAmount.Should().Be(3700m);
        inv3.BalanceDue.Should().Be(3700m);

        // Verify per-item clinician attribution across all 6 items
        var docAItems = inv3.LineItems.Where(li => li.DoctorId == docAId).ToList();
        docAItems.Should().HaveCount(3);
        docAItems.Sum(li => li.TotalPrice).Should().Be(1000m);

        var docBItems = inv3.LineItems.Where(li => li.DoctorId == docBId).ToList();
        docBItems.Should().HaveCount(2);
        docBItems.Sum(li => li.TotalPrice).Should().Be(1900m);

        var docCItems = inv3.LineItems.Where(li => li.DoctorId == docCId).ToList();
        docCItems.Should().HaveCount(1);
        docCItems.Single().TotalPrice.Should().Be(800m);
    }

    [Fact]
    public async Task Challenge1_2_SeniorCitizenDiscount_RecalculatesAccuratelyOnMergedCharges()
    {
        // Scenario: Draft invoice has Senior Citizen (20%) discount. Incoming charges merge.
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var handler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, uow, clinicContext, publisher);

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();
        var docAId = Guid.NewGuid();
        var docBId = Guid.NewGuid();

        // Doctor A creates Draft with Senior Citizen 20% discount (Gross = 1,000, Discount = 200, Net = 800)
        var cmd1 = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Senior Citizen Patient",
            QueueItemId: queueItemId,
            AttendingDoctorId: docAId,
            DiscountType: DiscountType.SeniorCitizen,
            DiscountIdNumber: "OSCA-98765",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(docAId, "Dr. Alice Ramos", null, "CONS-01", "Senior Consultation", "Consultation", 1000m, 1)
            }
        );
        var inv1 = await handler.Handle(cmd1, CancellationToken.None);
        inv1.GrossAmount.Should().Be(1000m);
        inv1.DiscountAmount.Should().Be(200m);
        inv1.NetAmount.Should().Be(800m);

        // Doctor B merges charges (₱2,000 procedure) without explicitly restating discount
        var cmd2 = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Senior Citizen Patient",
            QueueItemId: queueItemId,
            AttendingDoctorId: docBId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(docBId, "Dr. Bob Santos", null, "PROC-01", "Minor Surgery", "Procedure", 2000m, 1)
            }
        );
        var inv2 = await handler.Handle(cmd2, CancellationToken.None);

        // Merged Total: Gross = 3000, 20% Discount = 600, Net = 2400, BalanceDue = 2400
        inv2.GrossAmount.Should().Be(3000m);
        inv2.DiscountPercentage.Should().Be(20m);
        inv2.DiscountAmount.Should().Be(600m);
        inv2.NetAmount.Should().Be(2400m);
        inv2.BalanceDue.Should().Be(2400m);
    }

    [Fact]
    public async Task Challenge1_3_PhilHealthKonsultaDiscount_MergedCharges_EmpiricalBehaviorCheck()
    {
        // Scenario: Draft invoice has PhilHealth Konsulta (100%) discount.
        // What happens when incoming charges merge with DiscountType = None?
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var handler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, uow, clinicContext, publisher);

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();
        var docAId = Guid.NewGuid();
        var docBId = Guid.NewGuid();

        // Doctor A creates PhilHealth Konsulta Draft (Gross = 500, Discount = 500, Net = 0)
        var cmd1 = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Konsulta Member",
            QueueItemId: queueItemId,
            AttendingDoctorId: docAId,
            DiscountType: DiscountType.PhilHealthKonsulta,
            DiscountIdNumber: "12-345678901-2",
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(docAId, "Dr. Alice Ramos", null, "KONS-01", "Konsulta First Consultation", "Consultation", 500m, 1)
            }
        );
        var inv1 = await handler.Handle(cmd1, CancellationToken.None);
        inv1.GrossAmount.Should().Be(500m);
        inv1.DiscountAmount.Should().Be(500m);
        inv1.NetAmount.Should().Be(0m);
        inv1.BalanceDue.Should().Be(0m);

        // Doctor B merges procedure charge (₱1,500) with default DiscountType = None
        var cmd2 = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Konsulta Member",
            QueueItemId: queueItemId,
            AttendingDoctorId: docBId,
            DiscountType: DiscountType.None,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(docBId, "Dr. Bob Santos", null, "PROC-EXTRA", "Non-Package Procedure", "Procedure", 1500m, 1)
            }
        );
        var inv2 = await handler.Handle(cmd2, CancellationToken.None);

        // EMPIRICAL OBSERVATION:
        // Because CreateInvoiceCommand.cs:163 explicitly checks:
        // if (request.DiscountType == DiscountType.None && existingInvoice.DiscountAmount > 0m)
        // { discountAmount = existingInvoice.DiscountAmount; }
        // The statutory Konsulta package discount is preserved at 500m, and the additional out-of-package
        // procedure of 1500m correctly falls through to NetAmount = 1500m and BalanceDue = 1500m.
        inv2.GrossAmount.Should().Be(2000m);
        inv2.DiscountAmount.Should().Be(500m);
        inv2.NetAmount.Should().Be(1500m);
        inv2.BalanceDue.Should().Be(1500m);
    }

    [Fact]
    public async Task Challenge1_4_PartiallyPaidInvoice_MergedCharges_CalculatesBalanceDueAccurately()
    {
        // Scenario: Invoice is PartiallyPaid (Gross = 2000, AmountPaid = 1000, BalanceDue = 1000).
        // Doctor B merges ₱1500 charges. Is BalanceDue accurately recalculated as NetAmount - AmountPaid?
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var createHandler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, uow, clinicContext, publisher);
        var paymentHandler = new RecordPaymentCommandHandler(invoiceRepo, uow, clinicContext);

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();
        var docAId = Guid.NewGuid();
        var docBId = Guid.NewGuid();

        // 1. Create initial invoice: ₱2,000
        var inv1 = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Patient Partial Payment",
            QueueItemId: queueItemId,
            AttendingDoctorId: docAId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(docAId, "Dr. Alice Ramos", null, "PROC-01", "Procedure 1", "Procedure", 2000m, 1)
            }
        ), CancellationToken.None);

        // 2. Patient makes partial payment of ₱1,000
        var paidInv = await paymentHandler.Handle(new RecordPaymentCommand(
            InvoiceId: inv1.Id,
            Amount: 1000m,
            Method: PaymentMethod.Cash
        ), CancellationToken.None);

        paidInv.Status.Should().Be(InvoiceStatus.PartiallyPaid);
        paidInv.AmountPaid.Should().Be(1000m);
        paidInv.BalanceDue.Should().Be(1000m);

        // 3. Doctor B merges ₱1,500 procedure into the partially paid invoice
        var mergedInv = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Patient Partial Payment",
            QueueItemId: queueItemId,
            AttendingDoctorId: docBId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(docBId, "Dr. Bob Santos", null, "PROC-02", "Additional Procedure", "Procedure", 1500m, 1)
            }
        ), CancellationToken.None);

        // Assert: Gross = 3500, AmountPaid = 1000, BalanceDue = 2500, Status = PartiallyPaid
        mergedInv.Id.Should().Be(inv1.Id);
        mergedInv.GrossAmount.Should().Be(3500m);
        mergedInv.NetAmount.Should().Be(3500m);
        mergedInv.AmountPaid.Should().Be(1000m);
        mergedInv.BalanceDue.Should().Be(2500m);
        mergedInv.Status.Should().Be(InvoiceStatus.PartiallyPaid);
    }

    [Fact]
    public async Task Challenge1_5_PaidInvoice_StrictDuplicateBlocking_And_AllowDuplicateOverride()
    {
        // Scenario: Invoice is fully Paid (AmountPaid == NetAmount).
        // Calling CreateInvoiceCommand throws ConflictException (409) if AllowDuplicate is false,
        // and generates a new invoice if AllowDuplicate is true.
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var createHandler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, uow, clinicContext, publisher);
        var paymentHandler = new RecordPaymentCommandHandler(invoiceRepo, uow, clinicContext);

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();

        // 1. Create and pay invoice
        var inv1 = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Settled Encounter Patient",
            QueueItemId: queueItemId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, null, null, "CONS-01", "Consultation", "Consultation", 500m, 1)
            }
        ), CancellationToken.None);

        await paymentHandler.Handle(new RecordPaymentCommand(
            InvoiceId: inv1.Id,
            Amount: 500m,
            Method: PaymentMethod.Cash
        ), CancellationToken.None);

        // 2. Attempt duplicate creation with AllowDuplicate = false -> MUST throw ConflictException
        var dupCmdBlocked = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Settled Encounter Patient",
            QueueItemId: queueItemId,
            AllowDuplicate: false,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, null, null, "EXTRA-01", "Followup", "Consultation", 300m, 1)
            }
        );

        var act = async () => await createHandler.Handle(dupCmdBlocked, CancellationToken.None);
        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("*already been generated and paid for this encounter*");

        // 3. Attempt duplicate creation with AllowDuplicate = true -> MUST generate new separate invoice
        var dupCmdAllowed = new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Settled Encounter Patient",
            QueueItemId: queueItemId,
            AllowDuplicate: true,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, null, null, "EXTRA-01", "Separate Invoice Followup", "Consultation", 300m, 1)
            }
        );

        var inv2 = await createHandler.Handle(dupCmdAllowed, CancellationToken.None);
        inv2.Should().NotBeNull();
        inv2.Id.Should().NotBe(inv1.Id);
        inv2.InvoiceNumber.Should().NotBe(inv1.InvoiceNumber);
        inv2.GrossAmount.Should().Be(300m);
        inv2.Status.Should().Be(InvoiceStatus.Draft);
    }

    [Fact]
    public async Task Challenge1_6_MergeDiscountWithPartialPayment_NetAmountZero_LeavesStatusPartiallyPaidBug()
    {
        // Scenario: Invoice was partially paid (AmountPaid = 500, NetAmount = 1000).
        // Doctor B merges with PhilHealth Konsulta (100% discount, NetAmount = 0).
        // BalanceDue is 0 (Math.Max(0, 0 - 500)).
        // But what is the Status?
        // Line 187: if (existingInvoice.AmountPaid >= netAmount && netAmount > 0m) -> 0 > 0 is false!
        // Line 191: else if (existingInvoice.AmountPaid > 0m) -> sets Status = PartiallyPaid!
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var createHandler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, uow, clinicContext, publisher);
        var paymentHandler = new RecordPaymentCommandHandler(invoiceRepo, uow, clinicContext);

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();

        // 1. Create invoice: ₱500
        var inv1 = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Patient Zero Net",
            QueueItemId: queueItemId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, null, null, "ITEM-1", "Consultation", "Consultation", 500m, 1)
            }
        ), CancellationToken.None);

        // 2. Patient pays ₱500 in full
        await paymentHandler.Handle(new RecordPaymentCommand(
            InvoiceId: inv1.Id,
            Amount: 500m,
            Method: PaymentMethod.Cash
        ), CancellationToken.None);

        // 3. Now Doctor B merges items with 100% discount (PhilHealth Konsulta)
        // Wait, inv1 is Paid, so let's test where it was PARTIALLY paid:
        // Say initial was ₱1000, patient paid ₱500.
        // Let's reset with a new patient
        var patient2Id = Guid.NewGuid();
        var queue2Id = Guid.NewGuid();

        var invPart = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patient2Id,
            PatientName: "Patient Partial Zero Net",
            QueueItemId: queue2Id,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, null, null, "ITEM-1", "Consultation", "Consultation", 1000m, 1)
            }
        ), CancellationToken.None);

        await paymentHandler.Handle(new RecordPaymentCommand(
            InvoiceId: invPart.Id,
            Amount: 500m,
            Method: PaymentMethod.Cash
        ), CancellationToken.None);

        // Now Doctor B updates with PhilHealth Konsulta (100% discount on 1000 gross = 0 net)
        var merged = await createHandler.Handle(new CreateInvoiceCommand(
            PatientId: patient2Id,
            PatientName: "Patient Partial Zero Net",
            QueueItemId: queue2Id,
            DiscountType: DiscountType.PhilHealthKonsulta,
            DiscountIdNumber: "12-345678901-2",
            LineItems: new List<CreateInvoiceLineItemRequest>()
        ), CancellationToken.None);

        // EMPIRICAL VERIFICATION:
        // NetAmount is 0m.
        merged.NetAmount.Should().Be(0m);
        // BalanceDue is 0m (patient owes nothing).
        merged.BalanceDue.Should().Be(0m);
        // Status is Paid because BalanceDue == 0 and AmountPaid > 0!
        merged.Status.Should().Be(InvoiceStatus.Paid,
            "Invoice with BalanceDue = 0 and AmountPaid > 0 is marked Paid");
    }

    #endregion

    #region Challenge 2: Doctor Shares Report Accuracy

    [Fact]
    public async Task Challenge2_1_DoctorShares_CalculatesAttribution_WhenBothDoctorsHaveConsultations()
    {
        // Scenario: Doctor A billed ₱1,000 Consultation, Doctor B billed ₱5,000 Procedure on same invoice.
        // Both doctors have consultation encounters in the system.
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var docAId = Guid.NewGuid();
        var docAName = "Dr. Alice Ramos";
        var docBId = Guid.NewGuid();
        var docBName = "Dr. Bob Santos";

        var today = DateTime.UtcNow;

        // Register consultations for both doctors
        await context.Consultations.AddRangeAsync(
            new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicId,
                TenantId = tenantId,
                PatientId = Guid.NewGuid(),
                PatientName = "Patient Alice",
                DoctorId = docAId,
                DoctorName = docAName,
                EncounterDate = today
            },
            new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicId,
                TenantId = tenantId,
                PatientId = Guid.NewGuid(),
                PatientName = "Patient Bob",
                DoctorId = docBId,
                DoctorName = docBName,
                EncounterDate = today
            }
        );

        // Single invoice with Doctor A consultation and Doctor B procedure
        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            InvoiceNumber = "INV-SHARE-001",
            InvoiceDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Shared Patient",
            Status = InvoiceStatus.Paid,
            GrossAmount = 6000m,
            NetAmount = 6000m,
            AmountPaid = 6000m,
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    DoctorId = docAId,
                    DoctorName = docAName,
                    Description = "Comprehensive Consultation",
                    Category = "Consultation",
                    UnitPrice = 1000m,
                    Quantity = 1,
                    TotalPrice = 1000m
                },
                new()
                {
                    DoctorId = docBId,
                    DoctorName = docBName,
                    Description = "Surgical Procedure",
                    Category = "Procedure",
                    UnitPrice = 5000m,
                    Quantity = 1,
                    TotalPrice = 5000m
                }
            }
        };

        await context.Invoices.AddAsync(invoice);
        await context.SaveChangesAsync();

        var handler = new GetDoctorSharesReportQueryHandler(consultRepo, invoiceRepo, procRepo, clinicContext);
        var report = await handler.Handle(new GetDoctorSharesReportQuery(
            StartDate: today.AddDays(-1),
            EndDate: today.AddDays(1)
        ), CancellationToken.None);

        report.Should().NotBeNull();
        report.DoctorShares.Should().HaveCount(2);

        var docAShare = report.DoctorShares.FirstOrDefault(d => d.DoctorId == docAId.ToString() || d.DoctorName == docAName);
        var docBShare = report.DoctorShares.FirstOrDefault(d => d.DoctorId == docBId.ToString() || d.DoctorName == docBName);

        docAShare.Should().NotBeNull();
        docAShare!.TotalConsultationGross.Should().Be(1000m);
        docAShare.TotalProcedureGross.Should().Be(0m);
        docAShare.TotalGrossGenerated.Should().Be(1000m);
        docAShare.EstimatedPhysicianShare.Should().Be(700m); // 70% default

        docBShare.Should().NotBeNull();
        docBShare!.TotalConsultationGross.Should().Be(0m);
        docBShare.TotalProcedureGross.Should().Be(5000m);
        docBShare.TotalGrossGenerated.Should().Be(5000m);
        docBShare.EstimatedPhysicianShare.Should().Be(3500m); // 70% default
    }

    [Fact]
    public async Task Challenge2_2_DoctorShares_ProcedureDoctorWithoutConsultation_RevealsOmissionBug()
    {
        // Scenario: Doctor A has a consultation (₱1,000 Consultation).
        // Doctor B is a procedural specialist who performed a ₱5,000 Procedure on the same invoice,
        // but Doctor B has NO record in ConsultationEncounters.
        // What does GetDoctorSharesReportQuery produce?
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var docAId = Guid.NewGuid();
        var docAName = "Dr. Alice Ramos";
        var docBId = Guid.NewGuid();
        var docBName = "Dr. Bob Santos"; // Specialist who only performed a procedure

        var today = DateTime.UtcNow;

        // ONLY Doctor A has a consultation encounter
        await context.Consultations.AddAsync(
            new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicId,
                TenantId = tenantId,
                PatientId = Guid.NewGuid(),
                PatientName = "Patient Alice",
                DoctorId = docAId,
                DoctorName = docAName,
                EncounterDate = today
            }
        );

        // Single invoice has charges for BOTH Doctor A (₱1,000 Consultation) and Doctor B (₱5,000 Procedure)
        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            InvoiceNumber = "INV-SHARE-SPECIALIST",
            InvoiceDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Procedure Patient",
            Status = InvoiceStatus.Paid,
            GrossAmount = 6000m,
            NetAmount = 6000m,
            AmountPaid = 6000m,
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    DoctorId = docAId,
                    DoctorName = docAName,
                    Description = "General Consultation",
                    Category = "Consultation",
                    UnitPrice = 1000m,
                    Quantity = 1,
                    TotalPrice = 1000m
                },
                new()
                {
                    DoctorId = docBId,
                    DoctorName = docBName,
                    Description = "Specialist Procedure",
                    Category = "Procedure",
                    UnitPrice = 5000m,
                    Quantity = 1,
                    TotalPrice = 5000m
                }
            }
        };

        await context.Invoices.AddAsync(invoice);
        await context.SaveChangesAsync();

        var handler = new GetDoctorSharesReportQueryHandler(consultRepo, invoiceRepo, procRepo, clinicContext);
        var report = await handler.Handle(new GetDoctorSharesReportQuery(
            StartDate: today.AddDays(-1),
            EndDate: today.AddDays(1)
        ), CancellationToken.None);

        // EMPIRICAL OBSERVATION & DEFECT DETECTION:
        // GetDoctorSharesReportQueryHandler groups ONLY by consultations:
        // var doctorGroups = consultations.GroupBy(c => new { c.DoctorId, c.DoctorName }).ToList();
        // Because Doctor B has no ConsultationEncounter, Doctor B is completely excluded from doctorGroups.
        // Therefore, Doctor B's ₱5,000 procedure is completely lost from the Doctor Shares report!
        var docBShare = report.DoctorShares.FirstOrDefault(d => d.DoctorId == docBId.ToString() || d.DoctorName == docBName);
        
        docBShare.Should().NotBeNull("Doctor B is discovered from invoice line items even without a consultation");
        docBShare!.TotalProcedureGross.Should().Be(5000m);
        report.TotalClinicGrossRevenue.Should().Be(6000m, "TotalClinicGrossRevenue includes Doctor B's ₱5,000 procedure from invoice line items");
    }

    #endregion

    #region Challenge 3: Concurrency & Database State Integrity

    [Fact]
    public async Task Challenge3_1_MultipleSequentialAppends_PreservesTrackedState_WithoutConcurrencyException()
    {
        // Verify that multiple sequential merges into an existing tracked invoice do not trigger
        // DbUpdateConcurrencyException and correctly update GrossAmount and LineItems.
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var publisher = Substitute.For<IBillingRequestPublisher>();

        var handler = new CreateInvoiceCommandHandler(invoiceRepo, patientRepo, encounterRepo, uow, clinicContext, publisher);

        var patientId = Guid.NewGuid();
        var queueItemId = Guid.NewGuid();

        // Step 1: Initial creation
        var inv = await handler.Handle(new CreateInvoiceCommand(
            PatientId: patientId,
            PatientName: "Concurrency Patient",
            QueueItemId: queueItemId,
            LineItems: new List<CreateInvoiceLineItemRequest>
            {
                new(null, null, null, "ITEM-1", "Initial Item", "General", 100m, 1)
            }
        ), CancellationToken.None);

        // Step 2: 5 sequential merges
        for (int i = 2; i <= 6; i++)
        {
            inv = await handler.Handle(new CreateInvoiceCommand(
                PatientId: patientId,
                PatientName: "Concurrency Patient",
                QueueItemId: queueItemId,
                LineItems: new List<CreateInvoiceLineItemRequest>
                {
                    new(null, null, null, $"ITEM-{i}", $"Appended Item {i}", "General", 100m, 1)
                }
            ), CancellationToken.None);
        }

        inv.LineItems.Should().HaveCount(6);
        inv.GrossAmount.Should().Be(600m);
        inv.BalanceDue.Should().Be(600m);

        // Verify direct database read matches
        var dbInvoice = await context.Invoices.Include(i => i.LineItems).FirstAsync(i => i.Id == inv.Id);
        dbInvoice.LineItems.Should().HaveCount(6);
        dbInvoice.GrossAmount.Should().Be(600m);
    }

    #endregion
}
