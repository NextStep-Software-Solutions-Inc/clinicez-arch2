using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

public class Milestone1AnalyticsHardeningStressTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinic1Id = Guid.NewGuid();
    private readonly Guid _clinic2Id = Guid.NewGuid();
    private const string _tenant1Id = "tenant-alpha";
    private const string _tenant2Id = "tenant-beta";

    public Milestone1AnalyticsHardeningStressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinic1Id);
        _clinicContext.TenantId.Returns(_tenant1Id);
    }

    [Fact]
    public void ApplicationDbContext_ModelIndexes_ShouldContainAllCompositeTemporalIndexes()
    {
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);

        // 1. ConsultationEncounter: (TenantId, ClinicId, EncounterDate)
        var encounterEntity = context.Model.FindEntityType(typeof(ConsultationEncounter));
        encounterEntity.Should().NotBeNull();
        encounterEntity!.GetIndexes().Should().Contain(idx =>
            idx.Properties.Select(p => p.Name).SequenceEqual(new[] { "TenantId", "ClinicId", "EncounterDate" }));

        // 2. PaymentRecord: (TenantId, ClinicId, PaymentDate)
        var paymentEntity = context.Model.FindEntityType(typeof(PaymentRecord));
        paymentEntity.Should().NotBeNull();
        paymentEntity!.GetIndexes().Should().Contain(idx =>
            idx.Properties.Select(p => p.Name).SequenceEqual(new[] { "TenantId", "ClinicId", "PaymentDate" }));

        // 3. Procedure: (TenantId, ClinicId, ScheduledAt)
        var procEntity = context.Model.FindEntityType(typeof(Procedure));
        procEntity.Should().NotBeNull();
        procEntity!.GetIndexes().Should().Contain(idx =>
            idx.Properties.Select(p => p.Name).SequenceEqual(new[] { "TenantId", "ClinicId", "ScheduledAt" }));

        // 4. LabOrder: (TenantId, ClinicId, OrderDate)
        var labEntity = context.Model.FindEntityType(typeof(LabOrder));
        labEntity.Should().NotBeNull();
        labEntity!.GetIndexes().Should().Contain(idx =>
            idx.Properties.Select(p => p.Name).SequenceEqual(new[] { "TenantId", "ClinicId", "OrderDate" }));

        // 5. QueueItem: (TenantId, ClinicId, CheckInTime)
        var queueEntity = context.Model.FindEntityType(typeof(QueueItem));
        queueEntity.Should().NotBeNull();
        queueEntity!.GetIndexes().Should().Contain(idx =>
            idx.Properties.Select(p => p.Name).SequenceEqual(new[] { "TenantId", "ClinicId", "CheckInTime" }));

        // 6. Global query filter on PaymentRecord
#pragma warning disable CS0618
        paymentEntity.GetQueryFilter().Should().NotBeNull();
#pragma warning restore CS0618
    }

    [Fact]
    public async Task MultiTenantIsolation_ShouldNeverLeakDataFromOtherClinicsOrTenants()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var today = DateTime.UtcNow.Date.AddHours(10);

        // Seed Clinic 1 (Target clinic)
        var patient1 = new Patient
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientCode = "PAT-C1",
            FirstName = "Maria",
            LastName = "Clara",
            DateOfBirth = new DateOnly(1995, 5, 20),
            Sex = BiologicalSex.Female,
            ContactNumber = "09170000001"
        };
        await patientRepo.AddAsync(patient1);

        var inv1 = new Invoice
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            InvoiceNumber = "INV-C1-001",
            InvoiceDate = today,
            PatientId = patient1.Id,
            PatientName = "Maria Clara",
            GrossAmount = 1500m,
            NetAmount = 1200m,
            DiscountType = DiscountType.SeniorCitizen,
            DiscountAmount = 300m,
            AmountPaid = 1200m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            LineItems = new List<InvoiceLineItem>
            {
                new() { DoctorName = "Dr. C1 Doctor", Description = "Consultation", Category = "Consultation", UnitPrice = 1500m, TotalPrice = 1500m }
            }
        };
        await invoiceRepo.AddAsync(inv1);

        var pay1 = new PaymentRecord
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            InvoiceId = inv1.Id,
            PaymentNumber = "OR-C1-001",
            PaymentDate = today,
            Amount = 1200m,
            Method = PaymentMethod.Cash
        };
        await paymentRepo.AddAsync(pay1);

        var enc1 = new ConsultationEncounter
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientId = patient1.Id,
            PatientName = "Maria Clara",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. C1 Doctor",
            EncounterDate = today,
            Diagnoses = new List<EncounterDiagnosis>
            {
                new() { Icd10Code = "J06.9", Description = "Acute URI", IsPrimary = true }
            }
        };
        await consultRepo.AddAsync(enc1);

        // Seed Clinic 2 (FOREIGN clinic - should be 100% isolated!)
        var patient2 = new Patient
        {
            TenantId = _tenant2Id,
            ClinicId = _clinic2Id,
            PatientCode = "PAT-C2",
            FirstName = "Crisostomo",
            LastName = "Ibarra",
            DateOfBirth = new DateOnly(1980, 1, 1),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170000002"
        };
        await patientRepo.AddAsync(patient2);

        var inv2 = new Invoice
        {
            TenantId = _tenant2Id,
            ClinicId = _clinic2Id,
            InvoiceNumber = "INV-C2-999",
            InvoiceDate = today,
            PatientId = patient2.Id,
            PatientName = "Crisostomo Ibarra",
            GrossAmount = 50000m,
            NetAmount = 40000m,
            DiscountType = DiscountType.SeniorCitizen,
            DiscountAmount = 10000m,
            AmountPaid = 40000m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            LineItems = new List<InvoiceLineItem>
            {
                new() { DoctorName = "Dr. C2 Foreign", Description = "Consultation", Category = "Consultation", UnitPrice = 50000m, TotalPrice = 50000m }
            }
        };
        await invoiceRepo.AddAsync(inv2);

        var pay2 = new PaymentRecord
        {
            TenantId = _tenant2Id,
            ClinicId = _clinic2Id,
            InvoiceId = inv2.Id,
            PaymentNumber = "OR-C2-999",
            PaymentDate = today,
            Amount = 40000m,
            Method = PaymentMethod.CreditCard
        };
        await paymentRepo.AddAsync(pay2);

        var enc2 = new ConsultationEncounter
        {
            TenantId = _tenant2Id,
            ClinicId = _clinic2Id,
            PatientId = patient2.Id,
            PatientName = "Crisostomo Ibarra",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. C2 Foreign",
            EncounterDate = today,
            Diagnoses = new List<EncounterDiagnosis>
            {
                new() { Icd10Code = "I10", Description = "Hypertension", IsPrimary = true }
            }
        };
        await consultRepo.AddAsync(enc2);
        await uow.SaveChangesAsync();

        // 1. Verify Daily EOD Report
        var eodHandler = new GetDailyEodReportQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext, settingsRepo);
        var eodResult = await eodHandler.Handle(new GetDailyEodReportQuery(today.Date), CancellationToken.None);

        eodResult.TotalGrossAmount.Should().Be(1500m); // Excludes 50,000m from C2
        eodResult.TotalAmountCollected.Should().Be(1200m); // Excludes 40,000m from C2
        eodResult.DoctorWorkloads.Should().HaveCount(1);
        eodResult.DoctorWorkloads[0].DoctorName.Should().Be("Dr. C1 Doctor");
        eodResult.CollectionsByMethod.Should().HaveCount(1);
        eodResult.CollectionsByMethod[0].Method.Should().Be("Cash");

        // 2. Verify Clinic Analytics
        var analyticsHandler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);
        var analyticsResult = await analyticsHandler.Handle(new GetClinicAnalyticsQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        analyticsResult.TotalGrossRevenue.Should().Be(1500m);
        analyticsResult.TotalCollections.Should().Be(1200m);
        analyticsResult.DoctorStats.Should().HaveCount(1);
        analyticsResult.DoctorStats[0].DoctorName.Should().Be("Dr. C1 Doctor");
        analyticsResult.TenderShares.Should().HaveCount(1);
        analyticsResult.TenderShares[0].Method.Should().Be("Cash");

        // 3. Verify Tax Discount Audit Report
        var taxHandler = new GetTaxDiscountAuditReportQueryHandler(invoiceRepo, _clinicContext);
        var taxResult = await taxHandler.Handle(new GetTaxDiscountAuditReportQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        taxResult.TotalInvoicesAudited.Should().Be(1);
        taxResult.TotalGrossSales.Should().Be(1500m);
        taxResult.Items.Should().HaveCount(1);
        taxResult.Items[0].InvoiceNumber.Should().Be("INV-C1-001");

        // 4. Verify Doctor Shares Report
        var docSharesHandler = new GetDoctorSharesReportQueryHandler(consultRepo, invoiceRepo, procRepo, _clinicContext, settingsRepo);
        var docSharesResult = await docSharesHandler.Handle(new GetDoctorSharesReportQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        docSharesResult.TotalClinicEncounters.Should().Be(1);
        docSharesResult.DoctorShares.Should().HaveCount(1);
        docSharesResult.DoctorShares[0].DoctorName.Should().Be("Dr. C1 Doctor");

        // 5. Verify Morbidity Report
        var morbHandler = new GetMorbidityReportQueryHandler(consultRepo, patientRepo, _clinicContext, settingsRepo);
        var morbResult = await morbHandler.Handle(new GetMorbidityReportQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        morbResult.TotalEncountersReviewed.Should().Be(1);
        morbResult.Diseases.Should().HaveCount(1);
        morbResult.Diseases[0].Icd10Code.Should().Be("J06.9");
        morbResult.Diseases.Should().NotContain(d => d.Icd10Code == "I10"); // C2's diagnosis must not leak
    }

    [Fact]
    public async Task SoftDeletedRecords_ShouldBeExcludedFromAllAggregations()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var today = DateTime.UtcNow.Date.AddHours(11);

        // Seed soft-deleted patient
        var patient = new Patient
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientCode = "PAT-DEL",
            FirstName = "Deleted",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1985, 1, 1),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170000003",
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        await patientRepo.AddAsync(patient);

        // Seed soft-deleted queue item
        var qItem = new QueueItem
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            QueueNumber = "Q-DEL",
            SequenceNumber = 99,
            QueueDate = DateOnly.FromDateTime(today),
            PatientId = patient.Id,
            PatientName = "Deleted Patient",
            CheckInTime = today,
            CalledTime = today.AddMinutes(15),
            CompletedTime = today.AddMinutes(30),
            Status = QueueStatus.Completed,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        await queueRepo.AddAsync(qItem);

        // Seed soft-deleted invoice
        var invoice = new Invoice
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            InvoiceNumber = "INV-DEL",
            InvoiceDate = today,
            PatientId = patient.Id,
            PatientName = "Deleted Patient",
            GrossAmount = 2000m,
            NetAmount = 1600m,
            DiscountType = DiscountType.SeniorCitizen,
            DiscountAmount = 400m,
            AmountPaid = 1600m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        await invoiceRepo.AddAsync(invoice);

        // Seed soft-deleted payment
        var payment = new PaymentRecord
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            InvoiceId = invoice.Id,
            PaymentNumber = "OR-DEL",
            PaymentDate = today,
            Amount = 1600m,
            Method = PaymentMethod.Cash,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        await paymentRepo.AddAsync(payment);

        // Seed soft-deleted consultation
        var consult = new ConsultationEncounter
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientId = patient.Id,
            PatientName = "Deleted Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Ghost",
            EncounterDate = today,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow,
            Diagnoses = new List<EncounterDiagnosis>
            {
                new() { Icd10Code = "Z00.0", Description = "General exam", IsPrimary = true }
            }
        };
        await consultRepo.AddAsync(consult);

        // Seed soft-deleted procedure
        var proc = new Procedure
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientId = patient.Id,
            PatientName = "Deleted Patient",
            ProcedureName = "Deleted Procedure",
            Category = "Minor",
            ScheduledAt = today,
            Status = ProcedureStatus.Completed,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        await procRepo.AddAsync(proc);

        // Seed soft-deleted lab order
        var lab = new LabOrder
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientId = patient.Id,
            PatientName = "Deleted Patient",
            OrderNumber = "LAB-DEL",
            OrderDate = today,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        await labRepo.AddAsync(lab);

        await uow.SaveChangesAsync();

        // 1. Daily EOD
        var eodHandler = new GetDailyEodReportQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext, settingsRepo);
        var eodResult = await eodHandler.Handle(new GetDailyEodReportQuery(today.Date), CancellationToken.None);

        eodResult.TotalCheckedIn.Should().Be(0);
        eodResult.TotalGrossAmount.Should().Be(0m);
        eodResult.TotalAmountCollected.Should().Be(0m);
        eodResult.TotalProceduresPerformed.Should().Be(0);
        eodResult.TotalLabOrdersIssued.Should().Be(0);
        eodResult.CollectionsByMethod.Should().BeEmpty();
        eodResult.DoctorWorkloads.Should().BeEmpty();

        // 2. Clinic Analytics
        var analyticsHandler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);
        var analyticsResult = await analyticsHandler.Handle(new GetClinicAnalyticsQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        analyticsResult.TotalGrossRevenue.Should().Be(0m);
        analyticsResult.TotalCollections.Should().Be(0m);
        analyticsResult.TopDiagnoses.Should().BeEmpty();
        analyticsResult.TopServices.Should().BeEmpty();
        analyticsResult.DoctorStats.Should().BeEmpty();

        // 3. Tax Discount Audit
        var taxHandler = new GetTaxDiscountAuditReportQueryHandler(invoiceRepo, _clinicContext);
        var taxResult = await taxHandler.Handle(new GetTaxDiscountAuditReportQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        taxResult.TotalInvoicesAudited.Should().Be(0);
        taxResult.Items.Should().BeEmpty();

        // 4. Doctor Shares
        var docSharesHandler = new GetDoctorSharesReportQueryHandler(consultRepo, invoiceRepo, procRepo, _clinicContext, settingsRepo);
        var docSharesResult = await docSharesHandler.Handle(new GetDoctorSharesReportQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        docSharesResult.TotalClinicEncounters.Should().Be(0);
        docSharesResult.DoctorShares.Should().BeEmpty();

        // 5. Morbidity
        var morbHandler = new GetMorbidityReportQueryHandler(consultRepo, patientRepo, _clinicContext, settingsRepo);
        var morbResult = await morbHandler.Handle(new GetMorbidityReportQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        morbResult.TotalEncountersReviewed.Should().Be(0);
        morbResult.Diseases.Should().BeEmpty();
    }

    [Fact]
    public async Task VoidedAndRefundedInvoices_ShouldBeExcludedFromFinancialAggregations()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var today = DateTime.UtcNow.Date.AddHours(14);
        var patientId = Guid.NewGuid();

        // 1. Paid invoice (Valid)
        var validInv = new Invoice
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            InvoiceNumber = "INV-VALID",
            InvoiceDate = today,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            GrossAmount = 1000m,
            NetAmount = 800m,
            DiscountType = DiscountType.SeniorCitizen,
            DiscountAmount = 200m,
            AmountPaid = 800m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            LineItems = new List<InvoiceLineItem>
            {
                new() { DoctorName = "Dr. Active", Description = "Consultation", Category = "Consultation", UnitPrice = 1000m, TotalPrice = 1000m }
            }
        };
        await invoiceRepo.AddAsync(validInv);

        // 2. Voided invoice (Must be excluded)
        var voidedInv = new Invoice
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            InvoiceNumber = "INV-VOID",
            InvoiceDate = today,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            GrossAmount = 5000m,
            NetAmount = 4000m,
            DiscountType = DiscountType.SeniorCitizen,
            DiscountAmount = 1000m,
            AmountPaid = 0m,
            BalanceDue = 4000m,
            Status = InvoiceStatus.Voided
        };
        await invoiceRepo.AddAsync(voidedInv);

        // 3. Refunded invoice (Must be excluded from EOD and Analytics)
        var refundedInv = new Invoice
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            InvoiceNumber = "INV-REFUND",
            InvoiceDate = today,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            GrossAmount = 3000m,
            NetAmount = 2400m,
            DiscountType = DiscountType.Pwd,
            DiscountAmount = 600m,
            AmountPaid = 0m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Refunded
        };
        await invoiceRepo.AddAsync(refundedInv);

        await uow.SaveChangesAsync();

        // 1. Daily EOD
        var eodHandler = new GetDailyEodReportQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext, settingsRepo);
        var eod = await eodHandler.Handle(new GetDailyEodReportQuery(today.Date), CancellationToken.None);

        eod.TotalGrossAmount.Should().Be(1000m);
        eod.TotalDiscountsGiven.Should().Be(200m);
        eod.TotalNetAmount.Should().Be(800m);

        // 2. Clinic Analytics
        var analyticsHandler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);
        var analytics = await analyticsHandler.Handle(new GetClinicAnalyticsQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        analytics.TotalGrossRevenue.Should().Be(1000m);
        analytics.TotalNetRevenue.Should().Be(800m);
        analytics.SeniorDiscountsGiven.Should().Be(200m);
        analytics.PwdDiscountsGiven.Should().Be(0m); // Refunded PWD invoice excluded!

        // 3. Tax Discount Audit: Voided invoices must be excluded from audit trail
        var taxHandler = new GetTaxDiscountAuditReportQueryHandler(invoiceRepo, _clinicContext);
        var tax = await taxHandler.Handle(new GetTaxDiscountAuditReportQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        tax.Items.Should().NotContain(i => i.InvoiceNumber == "INV-VOID");
        tax.Items.Should().Contain(i => i.InvoiceNumber == "INV-VALID");
        var refundedItem = tax.Items.FirstOrDefault(i => i.InvoiceNumber == "INV-REFUND");
        if (refundedItem != null)
        {
            refundedItem.AmountPaid.Should().Be(0m);
        }
    }

    [Fact]
    public async Task ProcedureStatusFiltering_ShouldOnlyCountCompletedProceduresInEod()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var today = DateTime.UtcNow.Date.AddHours(9);
        var patientId = Guid.NewGuid();

        // 1. Completed procedure
        await procRepo.AddAsync(new Procedure
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientId = patientId,
            PatientName = "Patient A",
            ProcedureName = "Nebulization",
            Category = "Respiratory",
            ScheduledAt = today,
            Status = ProcedureStatus.Completed
        });

        // 2. Cancelled procedure
        await procRepo.AddAsync(new Procedure
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientId = patientId,
            PatientName = "Patient B",
            ProcedureName = "ECG",
            Category = "Cardiology",
            ScheduledAt = today,
            Status = ProcedureStatus.Cancelled
        });

        // 3. InProgress procedure
        await procRepo.AddAsync(new Procedure
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientId = patientId,
            PatientName = "Patient C",
            ProcedureName = "Wound Dressing",
            Category = "Minor",
            ScheduledAt = today,
            Status = ProcedureStatus.InProgress
        });

        // 4. Ordered procedure
        await procRepo.AddAsync(new Procedure
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientId = patientId,
            PatientName = "Patient D",
            ProcedureName = "Suture Removal",
            Category = "Minor",
            ScheduledAt = today,
            Status = ProcedureStatus.Ordered
        });

        await uow.SaveChangesAsync();

        var handler = new GetDailyEodReportQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext, settingsRepo);
        var result = await handler.Handle(new GetDailyEodReportQuery(today.Date), CancellationToken.None);

        // Only 1 completed procedure should be counted in EOD
        result.TotalProceduresPerformed.Should().Be(1);
    }

    [Fact]
    public async Task DoctorShares_ShouldRespectConfigurableSharePercentageAndExcludeNonMedicalCategories()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var today = DateTime.UtcNow.Date.AddHours(10);
        var docId = Guid.NewGuid();
        const string docName = "Dr. Specialist";

        // Set custom physician share to 80% (facility retention 20%)
        await settingsRepo.AddAsync(new FacilitySettings
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            ClinicName = "St. Luke Diagnostic",
            DefaultDoctorSharePercentage = 0.80m
        });

        // Consultation encounter
        await consultRepo.AddAsync(new ConsultationEncounter
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient One",
            DoctorId = docId,
            DoctorName = docName,
            EncounterDate = today
        });

        // Procedure performed by doc
        await procRepo.AddAsync(new Procedure
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient One",
            ProcedureName = "Minor Excision",
            Category = "Surgical",
            ScheduledAt = today,
            PerformedByStaffName = docName,
            Status = ProcedureStatus.Completed
        });

        // Invoice with mixed line items:
        // - Consultation: 1,000
        // - Procedure: 2,000
        // - Pharmacy / Medicine: 500 (Must NOT inflate doctor PF!)
        var invoice = new Invoice
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            InvoiceNumber = "INV-MIXED-001",
            InvoiceDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient One",
            AttendingDoctorId = docId,
            GrossAmount = 3500m,
            NetAmount = 3500m,
            Status = InvoiceStatus.Paid,
            LineItems = new List<InvoiceLineItem>
            {
                new() { DoctorId = docId, DoctorName = docName, Category = "Consultation", Description = "Specialist Consult", UnitPrice = 1000m, TotalPrice = 1000m },
                new() { DoctorId = docId, DoctorName = docName, Category = "Procedure", Description = "Minor Excision", UnitPrice = 2000m, TotalPrice = 2000m },
                new() { DoctorId = docId, DoctorName = docName, Category = "Pharmacy", Description = "Antibiotics", UnitPrice = 500m, TotalPrice = 500m }
            }
        };
        await invoiceRepo.AddAsync(invoice);
        await uow.SaveChangesAsync();

        var handler = new GetDoctorSharesReportQueryHandler(consultRepo, invoiceRepo, procRepo, _clinicContext, settingsRepo);
        var result = await handler.Handle(new GetDoctorSharesReportQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        result.DoctorShares.Should().HaveCount(1);
        var share = result.DoctorShares[0];
        share.DoctorName.Should().Be(docName);
        share.TotalEncounters.Should().Be(1);
        share.TotalProceduresAssisted.Should().Be(1);
        share.TotalConsultationGross.Should().Be(1000m);
        share.TotalProcedureGross.Should().Be(2000m);
        share.TotalGrossGenerated.Should().Be(3000m); // 1000 + 2000; Excludes 500 pharmacy!
        share.EstimatedPhysicianShare.Should().Be(2400m); // 3000 * 0.80 = 2400
        share.ClinicFacilityShare.Should().Be(600m); // 3000 - 2400 = 600
    }

    [Fact]
    public async Task AnomalousQueueTimestamps_ShouldNotProduceNegativeAveragesOrCrash()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);

        var today = DateTime.UtcNow.Date.AddHours(12);

        // Queue item with CalledTime EARLIER than CheckInTime (e.g. clock desync)
        var qItemAnomalous = new QueueItem
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            QueueNumber = "Q-ANOMALOUS",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(today),
            PatientId = Guid.NewGuid(),
            PatientName = "Test Patient",
            CheckInTime = today,
            CalledTime = today.AddMinutes(-10), // Earlier!
            CompletedTime = today.AddMinutes(-15), // Earlier!
            Status = QueueStatus.Completed
        };
        await queueRepo.AddAsync(qItemAnomalous);
        await uow.SaveChangesAsync();

        var handler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);

        var result = await handler.Handle(new GetClinicAnalyticsQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        result.Should().NotBeNull();
        result.Flow.TotalEncountersToday.Should().Be(1);
        result.Flow.CompletedToday.Should().Be(1);
        // Waited items filter: q.CalledTime > q.CheckInTime -> excluded, so avgWait is 0.0
        result.Flow.AverageWaitMinutes.Should().Be(0.0);
        // Consulted items filter: q.CompletedTime > q.CalledTime -> excluded, so avgConsult is 0.0
        result.Flow.AverageConsultMinutes.Should().Be(0.0);
    }

    [Fact]
    public async Task SingleEncounterClinic_ExactMathematicsVerification()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var today = DateTime.UtcNow.Date.AddHours(15);
        var patient = new Patient
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientCode = "PAT-SOLO",
            FirstName = "Solo",
            LastName = "Patient",
            DateOfBirth = new DateOnly(2015, 6, 1), // 11yo pediatric
            Sex = BiologicalSex.Female,
            ContactNumber = "09170000004"
        };
        await patientRepo.AddAsync(patient);

        var queue = new QueueItem
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(today),
            PatientId = patient.Id,
            PatientName = "Solo Patient",
            CheckInTime = today.AddMinutes(-40),
            CalledTime = today.AddMinutes(-30), // 10 min wait
            CompletedTime = today, // 30 min consult
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Completed
        };
        await queueRepo.AddAsync(queue);

        var invoice = new Invoice
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            InvoiceNumber = "INV-SOLO-01",
            InvoiceDate = today,
            PatientId = patient.Id,
            PatientName = "Solo Patient",
            GrossAmount = 800m,
            NetAmount = 800m,
            AmountPaid = 800m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            LineItems = new List<InvoiceLineItem>
            {
                new() { DoctorName = "Dr. Solo", Category = "Consultation", Description = "General Checkup", UnitPrice = 800m, TotalPrice = 800m }
            }
        };
        await invoiceRepo.AddAsync(invoice);

        var payment = new PaymentRecord
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            InvoiceId = invoice.Id,
            PaymentNumber = "OR-SOLO-01",
            PaymentDate = today,
            Amount = 800m,
            Method = PaymentMethod.GCash
        };
        await paymentRepo.AddAsync(payment);

        var consult = new ConsultationEncounter
        {
            TenantId = _tenant1Id,
            ClinicId = _clinic1Id,
            PatientId = patient.Id,
            PatientName = "Solo Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Solo",
            EncounterDate = today,
            Diagnoses = new List<EncounterDiagnosis>
            {
                new() { Icd10Code = "J00", Description = "Acute nasopharyngitis", IsPrimary = true }
            }
        };
        await consultRepo.AddAsync(consult);
        await uow.SaveChangesAsync();

        // 1. Clinic Analytics
        var analyticsHandler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);
        var analytics = await analyticsHandler.Handle(new GetClinicAnalyticsQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        analytics.Flow.AverageWaitMinutes.Should().Be(10.0);
        analytics.Flow.AverageConsultMinutes.Should().Be(30.0);
        analytics.TotalGrossRevenue.Should().Be(800m);
        analytics.TotalNetRevenue.Should().Be(800m);
        analytics.AverageTicketSize.Should().Be(800m);
        analytics.TenderShares.Should().ContainSingle();
        analytics.TenderShares[0].Method.Should().Be("GCash");
        analytics.TenderShares[0].Percentage.Should().Be(100.0);
        analytics.TopDiagnoses.Should().ContainSingle();
        analytics.TopDiagnoses[0].Icd10Code.Should().Be("J00");
        analytics.TopDiagnoses[0].PercentageShare.Should().Be(100.0);

        // 2. Morbidity Report
        var morbHandler = new GetMorbidityReportQueryHandler(consultRepo, patientRepo, _clinicContext, settingsRepo);
        var morb = await morbHandler.Handle(new GetMorbidityReportQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);

        morb.TotalEncountersReviewed.Should().Be(1);
        morb.TotalDiagnosesRecorded.Should().Be(1);
        morb.Diseases.Should().ContainSingle();
        var d = morb.Diseases[0];
        d.Icd10Code.Should().Be("J00");
        d.TotalCases.Should().Be(1);
        d.PediatricCases.Should().Be(1);
        d.AdultCases.Should().Be(0);
        d.SeniorCases.Should().Be(0);
        d.FemaleCases.Should().Be(1);
        d.MaleCases.Should().Be(0);
        d.PercentageOfTotal.Should().Be(100.0);
    }

    [Fact]
    public async Task NewlyProvisionedClinic_WithNullSettingsRepo_ShouldHandleGracefully()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        // Passing settingsRepo = null to simulate unconfigured or newly provisioned clinic
        var eodHandler = new GetDailyEodReportQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext, settingsRepo: null);
        var eod = await eodHandler.Handle(new GetDailyEodReportQuery(DateTime.UtcNow.Date), CancellationToken.None);
        eod.Should().NotBeNull();
        eod.TotalCheckedIn.Should().Be(0);

        var morbHandler = new GetMorbidityReportQueryHandler(
            consultRepo, patientRepo, _clinicContext, settingsRepo: null);
        var morb = await morbHandler.Handle(new GetMorbidityReportQuery(), CancellationToken.None);
        morb.Should().NotBeNull();
        morb.ClinicName.Should().Be("Clinic Facility"); // Safe fallback when settings is null

        var docSharesHandler = new GetDoctorSharesReportQueryHandler(
            consultRepo, invoiceRepo, procRepo, _clinicContext, settingsRepo: null);
        var docShares = await docSharesHandler.Handle(new GetDoctorSharesReportQuery(), CancellationToken.None);
        docShares.Should().NotBeNull();
        docShares.TotalClinicEncounters.Should().Be(0);
    }
}
