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

namespace ClinicEz.Clinic.Application.Tests;

public class ChallengerM1_2StressTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-stress-test";

    public ChallengerM1_2StressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public void Verify_CompositeTemporalIndexes_ConfiguredInModel()
    {
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var model = context.Model;

        // 1. ConsultationEncounter -> (TenantId, ClinicId, EncounterDate)
        var encounterEntity = model.FindEntityType(typeof(ConsultationEncounter));
        encounterEntity.Should().NotBeNull();
        var encounterIndexes = encounterEntity!.GetIndexes().Select(idx => idx.Properties.Select(p => p.Name).ToList()).ToList();
        encounterIndexes.Should().Contain(idx =>
            idx.SequenceEqual(new[] { "TenantId", "ClinicId", "EncounterDate" }));

        // 2. PaymentRecord -> (TenantId, ClinicId, PaymentDate)
        var paymentEntity = model.FindEntityType(typeof(PaymentRecord));
        paymentEntity.Should().NotBeNull();
        var paymentIndexes = paymentEntity!.GetIndexes().Select(idx => idx.Properties.Select(p => p.Name).ToList()).ToList();
        paymentIndexes.Should().Contain(idx =>
            idx.SequenceEqual(new[] { "TenantId", "ClinicId", "PaymentDate" }));

        // 3. ClinicalProcedure -> (TenantId, ClinicId, ScheduledAt)
        var procedureEntity = model.FindEntityType(typeof(ClinicalProcedure));
        procedureEntity.Should().NotBeNull();
        var procedureIndexes = procedureEntity!.GetIndexes().Select(idx => idx.Properties.Select(p => p.Name).ToList()).ToList();
        procedureIndexes.Should().Contain(idx =>
            idx.SequenceEqual(new[] { "TenantId", "ClinicId", "ScheduledAt" }));

        // 4. ClinicLabOrder -> (TenantId, ClinicId, OrderDate)
        var labOrderEntity = model.FindEntityType(typeof(ClinicLabOrder));
        labOrderEntity.Should().NotBeNull();
        var labIndexes = labOrderEntity!.GetIndexes().Select(idx => idx.Properties.Select(p => p.Name).ToList()).ToList();
        labIndexes.Should().Contain(idx =>
            idx.SequenceEqual(new[] { "TenantId", "ClinicId", "OrderDate" }));

        // 5. QueueItem -> (TenantId, ClinicId, CheckInTime)
        var queueEntity = model.FindEntityType(typeof(QueueItem));
        queueEntity.Should().NotBeNull();
        var queueIndexes = queueEntity!.GetIndexes().Select(idx => idx.Properties.Select(p => p.Name).ToList()).ToList();
        queueIndexes.Should().Contain(idx =>
            idx.SequenceEqual(new[] { "TenantId", "ClinicId", "CheckInTime" }));
    }

    [Fact]
    public async Task Verify_PaymentRecord_GlobalQueryFilter_EnforcesMultiTenancyAndSoftDelete()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var otherClinicId = Guid.NewGuid();

        var validPayment = new PaymentRecord
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PaymentNumber = "OR-VALID-01",
            Amount = 1000m,
            IsDeleted = false
        };

        var otherClinicPayment = new PaymentRecord
        {
            TenantId = _testTenantId,
            ClinicId = otherClinicId,
            PaymentNumber = "OR-OTHER-02",
            Amount = 2000m,
            IsDeleted = false
        };

        var softDeletedPayment = new PaymentRecord
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PaymentNumber = "OR-DELETED-03",
            Amount = 3000m,
            IsDeleted = true
        };

        context.Payments.AddRange(validPayment, otherClinicPayment, softDeletedPayment);
        await context.SaveChangesAsync();

        // Query directly via context
        var visiblePayments = await context.Payments.ToListAsync();
        visiblePayments.Should().HaveCount(1);
        visiblePayments.Single().PaymentNumber.Should().Be("OR-VALID-01");
    }

    [Fact]
    public async Task Verify_AllQueries_ExecuteWithoutException_WhenAllTablesEmpty_And_NoClinicSettings()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        // 1. GetClinicAnalyticsQuery with zero data and no settings
        var analyticsHandler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);
        var analytics = await analyticsHandler.Handle(new GetClinicAnalyticsQuery(), CancellationToken.None);
        analytics.Should().NotBeNull();
        analytics.TotalGrossRevenue.Should().Be(0m);
        analytics.TotalNetRevenue.Should().Be(0m);
        analytics.TotalCollections.Should().Be(0m);
        analytics.Flow.AverageWaitMinutes.Should().Be(0.0);
        analytics.Flow.AverageConsultMinutes.Should().Be(0.0);
        analytics.TopDiagnoses.Should().BeEmpty();
        analytics.TopServices.Should().BeEmpty();
        analytics.DoctorStats.Should().BeEmpty();
        analytics.TenderShares.Should().BeEmpty();

        // 2. GetDailyEodReportQuery with zero data and null settingsRepo
        var eodHandlerNoSettings = new GetDailyEodReportQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext, null);
        var eodNoSettings = await eodHandlerNoSettings.Handle(new GetDailyEodReportQuery(), CancellationToken.None);
        eodNoSettings.Should().NotBeNull();
        eodNoSettings.TotalCheckedIn.Should().Be(0);
        eodNoSettings.TotalGrossAmount.Should().Be(0m);
        eodNoSettings.TotalAmountCollected.Should().Be(0m);
        eodNoSettings.CollectionsByMethod.Should().BeEmpty();
        eodNoSettings.DoctorWorkloads.Should().BeEmpty();

        // 3. GetMorbidityReportQuery with zero data and null settingsRepo (fallback clinic name)
        var morbidityHandlerNoSettings = new GetMorbidityReportQueryHandler(
            consultRepo, patientRepo, _clinicContext, null);
        var morbidityNoSettings = await morbidityHandlerNoSettings.Handle(new GetMorbidityReportQuery(), CancellationToken.None);
        morbidityNoSettings.Should().NotBeNull();
        morbidityNoSettings.TotalEncountersReviewed.Should().Be(0);
        morbidityNoSettings.TotalDiagnosesRecorded.Should().Be(0);
        morbidityNoSettings.Diseases.Should().BeEmpty();
        morbidityNoSettings.ClinicName.Should().Be("Clinic Facility");

        // 4. GetTaxDiscountAuditReportQuery with zero data
        var taxHandler = new GetTaxDiscountAuditReportQueryHandler(invoiceRepo, _clinicContext);
        var taxAudit = await taxHandler.Handle(new GetTaxDiscountAuditReportQuery(), CancellationToken.None);
        taxAudit.Should().NotBeNull();
        taxAudit.TotalInvoicesAudited.Should().Be(0);
        taxAudit.TotalGrossSales.Should().Be(0m);
        taxAudit.TotalSeniorDiscounts.Should().Be(0m);
        taxAudit.TotalPwdDiscounts.Should().Be(0m);
        taxAudit.TotalVatExempted.Should().Be(0m);
        taxAudit.TotalNetCollections.Should().Be(0m);
        taxAudit.Items.Should().BeEmpty();

        // 5. GetDoctorSharesReportQuery with zero data and null settingsRepo (fallback 70%)
        var doctorSharesHandler = new GetDoctorSharesReportQueryHandler(
            consultRepo, invoiceRepo, procRepo, _clinicContext, null);
        var docShares = await doctorSharesHandler.Handle(new GetDoctorSharesReportQuery(), CancellationToken.None);
        docShares.Should().NotBeNull();
        docShares.TotalClinicEncounters.Should().Be(0);
        docShares.TotalClinicGrossRevenue.Should().Be(0m);
        docShares.TotalPhysicianShares.Should().Be(0m);
        docShares.TotalFacilityShares.Should().Be(0m);
        docShares.DoctorShares.Should().BeEmpty();
    }

    [Fact]
    public async Task Verify_AllQueries_ExecuteWithoutException_WhenEntitiesHaveNullOrEdgeFields()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var today = DateTime.UtcNow.Date.AddHours(10);

        // 1. QueueItems with null or anomalous fields
        var qNullTimes = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueNumber = "Q-EDGE-1",
            PatientName = "Null Times Patient",
            CheckInTime = today,
            CalledTime = null,
            CompletedTime = null,
            DoctorName = null,
            AppointmentId = null,
            Status = QueueStatus.Waiting
        };
        // Clock drift anomaly: CalledTime before CheckInTime
        var qAnomalousTimes = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueNumber = "Q-EDGE-2",
            PatientName = "Clock Drift Patient",
            CheckInTime = today,
            CalledTime = today.AddMinutes(-5),
            CompletedTime = today.AddMinutes(-10),
            Status = QueueStatus.Completed
        };
        await queueRepo.AddAsync(qNullTimes);
        await queueRepo.AddAsync(qAnomalousTimes);

        // 2. Invoice with null optional fields and missing payments
        var invEdge = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-EDGE-01",
            InvoiceDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Edge Patient",
            AttendingDoctorId = null,
            DiscountType = DiscountType.SeniorCitizen,
            DiscountIdNumber = null, // null ID
            GrossAmount = 1000m,
            DiscountAmount = 200m,
            NetAmount = 800m,
            AmountPaid = 0m,
            BalanceDue = 800m,
            Status = InvoiceStatus.Draft,
            Payments = new List<PaymentRecord>(), // No payments
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    Description = "Consultation Service",
                    Category = "Consultation",
                    UnitPrice = 600m,
                    TotalPrice = 600m
                },
                new()
                {
                    Description = "Miscellaneous Fee",
                    Category = "Other",
                    UnitPrice = 400m,
                    TotalPrice = 400m
                }
            }
        };
        await invoiceRepo.AddAsync(invEdge);

        // 3. Consultation with null licenses, empty diagnoses, and patient with non-binary gender
        var patientOtherGender = new ClinicPatient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-OTHER-GEN",
            FirstName = "Baby",
            LastName = "Doe",
            DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow), // Newborn (age 0)
            Gender = "Other",
            ContactNumber = "09000000000"
        };
        await patientRepo.AddAsync(patientOtherGender);

        var consultEdge = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patientOtherGender.Id,
            PatientName = "Baby Doe",
            DoctorId = Guid.Empty,
            DoctorName = "Dr. Unknown",
            DoctorPrcLicense = null,
            DoctorPtr = null,
            DoctorS2License = null,
            DoctorPhilHealthPan = null,
            EncounterDate = today,
            Diagnoses = new List<EncounterDiagnosis>() // Empty diagnoses
        };
        await consultRepo.AddAsync(consultEdge);

        // Encounter with unknown patient (patientLookup returns null -> age is null, gender is null)
        var consultUnknownPatient = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = Guid.NewGuid(), // Not in patientRepo
            PatientName = "Ghost Patient",
            DoctorId = Guid.Empty,
            DoctorName = "Dr. Unknown",
            EncounterDate = today,
            Diagnoses = new List<EncounterDiagnosis>()
        };
        await consultRepo.AddAsync(consultUnknownPatient);

        // 4. ClinicalProcedure with null ordered by and staff name
        var procEdge = new ClinicalProcedure
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patientOtherGender.Id,
            PatientName = "Baby Doe",
            ProcedureName = "Vaccination",
            Category = "Immunization",
            OrderedByDoctorName = null,
            PerformedByStaffName = null,
            ScheduledAt = today,
            Status = ProcedureStatus.Completed
        };
        await procRepo.AddAsync(procEdge);

        // 5. ClinicLabOrder with empty items
        var labEdge = new ClinicLabOrder
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patientOtherGender.Id,
            PatientName = "Baby Doe",
            OrderNumber = "LAB-EDGE-01",
            OrderDate = today,
            Items = new List<ClinicLabOrderItem>() // Empty items
        };
        await labRepo.AddAsync(labEdge);

        await uow.SaveChangesAsync();

        // Act & Assert for all queries - NONE must throw exception!
        var analyticsHandler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);
        var analytics = await analyticsHandler.Handle(new GetClinicAnalyticsQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);
        analytics.Should().NotBeNull();
        analytics.Flow.AverageWaitMinutes.Should().Be(0.0); // Anomalous and null times ignored
        analytics.Flow.AverageConsultMinutes.Should().Be(0.0);

        var taxHandler = new GetTaxDiscountAuditReportQueryHandler(invoiceRepo, _clinicContext);
        var taxAudit = await taxHandler.Handle(new GetTaxDiscountAuditReportQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);
        taxAudit.Should().NotBeNull();
        taxAudit.Items.Should().HaveCount(1);
        taxAudit.Items[0].IdentificationCardNumber.Should().Be("VERIFIED-ID");
        taxAudit.Items[0].OfficialReceiptNumber.Should().Be("PENDING-OR");
        taxAudit.Items[0].PaymentMethod.Should().Be("Unpaid");

        var morbidityHandler = new GetMorbidityReportQueryHandler(consultRepo, patientRepo, _clinicContext, null);
        var morbidity = await morbidityHandler.Handle(new GetMorbidityReportQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);
        morbidity.Should().NotBeNull();
        morbidity.TotalEncountersReviewed.Should().Be(2);
        morbidity.TotalDiagnosesRecorded.Should().Be(0);

        var doctorSharesHandler = new GetDoctorSharesReportQueryHandler(consultRepo, invoiceRepo, procRepo, _clinicContext, null);
        var docShares = await doctorSharesHandler.Handle(new GetDoctorSharesReportQuery(today.AddDays(-1), today.AddDays(1)), CancellationToken.None);
        docShares.Should().NotBeNull();
        docShares.DoctorShares.Should().HaveCount(1);
        docShares.DoctorShares[0].DoctorName.Should().Be("Dr. Unknown");
    }

    [Fact]
    public async Task Verify_Precision_DoctorShares_NoCentavoRoundingDrift_AcrossVariedPercentagesAndOddTotals()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        // Configure ClinicSettings with 75% physician share
        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Precision Medical Center",
            DefaultDoctorSharePercentage = 0.75m
        };
        await settingsRepo.AddAsync(settings);

        var date = DateTime.UtcNow.Date;

        // Create 4 doctors with tricky centavo totals:
        // Doctor 1: ₱333.33 (75% = 249.9975 -> 250.00, facility: 83.33 -> sum = 333.33)
        // Doctor 2: ₱500.55 (75% = 375.4125 -> 375.41, facility: 125.14 -> sum = 500.55)
        // Doctor 3: ₱0.01   (75% = 0.0075   -> 0.01,   facility: 0.00   -> sum = 0.01)
        // Doctor 4: ₱1,234.57 (75% = 925.9275 -> 925.93, facility: 308.64 -> sum = 1,234.57)

        var testDoctors = new (string Name, decimal ConsultGross, decimal ProcGross)[]
        {
            ("Dr. Alpha", 200.00m, 133.33m), // Total: 333.33
            ("Dr. Beta",  300.55m, 200.00m), // Total: 500.55
            ("Dr. Gamma", 0.01m,   0.00m),   // Total: 0.01
            ("Dr. Delta", 1000.00m, 234.57m) // Total: 1,234.57
        };

        foreach (var (docName, consultGross, procGross) in testDoctors)
        {
            var docId = Guid.NewGuid();
            var enc = new ConsultationEncounter
            {
                TenantId = _testTenantId,
                ClinicId = _testClinicId,
                PatientId = Guid.NewGuid(),
                PatientName = "Patient For " + docName,
                DoctorId = docId,
                DoctorName = docName,
                EncounterDate = date,
                Subjective = "Checkup"
            };
            await consultRepo.AddAsync(enc);

            var lineItems = new List<InvoiceLineItem>();
            if (consultGross > 0)
            {
                lineItems.Add(new InvoiceLineItem
                {
                    DoctorId = docId,
                    DoctorName = docName,
                    Description = "Consultation",
                    Category = "Consultation",
                    UnitPrice = consultGross,
                    TotalPrice = consultGross
                });
            }
            if (procGross > 0)
            {
                lineItems.Add(new InvoiceLineItem
                {
                    DoctorId = docId,
                    DoctorName = docName,
                    Description = "Procedure",
                    Category = "Procedure",
                    UnitPrice = procGross,
                    TotalPrice = procGross
                });
            }

            var totalGross = consultGross + procGross;
            var inv = new Invoice
            {
                TenantId = _testTenantId,
                ClinicId = _testClinicId,
                InvoiceNumber = $"INV-{docName.Replace(" ", "-")}",
                InvoiceDate = date,
                PatientId = enc.PatientId,
                PatientName = enc.PatientName,
                AttendingDoctorId = docId,
                GrossAmount = totalGross,
                NetAmount = totalGross,
                Status = InvoiceStatus.Paid,
                LineItems = lineItems
            };
            await invoiceRepo.AddAsync(inv);
        }

        await uow.SaveChangesAsync();

        var handler = new GetDoctorSharesReportQueryHandler(
            consultRepo, invoiceRepo, procRepo, _clinicContext, settingsRepo);
        var result = await handler.Handle(new GetDoctorSharesReportQuery(date.AddDays(-1), date.AddDays(1)), CancellationToken.None);

        result.Should().NotBeNull();
        result.DoctorShares.Should().HaveCount(4);

        // Verify mathematical invariant for each individual doctor: DoctorShare + FacilityShare == TotalGrossGenerated
        foreach (var doc in result.DoctorShares)
        {
            (doc.EstimatedPhysicianShare + doc.ClinicFacilityShare).Should().Be(doc.TotalGrossGenerated,
                $"Doctor {doc.DoctorName} share breakdown must sum exactly to total gross without centavo drift");
        }

        // Verify specific expected rounded centavos at 75%
        var alpha = result.DoctorShares.Single(d => d.DoctorName == "Dr. Alpha");
        alpha.TotalGrossGenerated.Should().Be(333.33m);
        alpha.EstimatedPhysicianShare.Should().Be(250.00m);
        alpha.ClinicFacilityShare.Should().Be(83.33m);

        var beta = result.DoctorShares.Single(d => d.DoctorName == "Dr. Beta");
        beta.TotalGrossGenerated.Should().Be(500.55m);
        beta.EstimatedPhysicianShare.Should().Be(375.41m);
        beta.ClinicFacilityShare.Should().Be(125.14m);

        var gamma = result.DoctorShares.Single(d => d.DoctorName == "Dr. Gamma");
        gamma.TotalGrossGenerated.Should().Be(0.01m);
        gamma.EstimatedPhysicianShare.Should().Be(0.01m);
        gamma.ClinicFacilityShare.Should().Be(0.00m);

        var delta = result.DoctorShares.Single(d => d.DoctorName == "Dr. Delta");
        delta.TotalGrossGenerated.Should().Be(1234.57m);
        delta.EstimatedPhysicianShare.Should().Be(925.93m);
        delta.ClinicFacilityShare.Should().Be(308.64m);

        // Verify grand totals invariant: TotalPhysicianShares + TotalFacilityShares == TotalClinicGrossRevenue
        (result.TotalPhysicianShares + result.TotalFacilityShares).Should().Be(result.TotalClinicGrossRevenue,
            "Total physician shares and facility shares must balance to the exact centavo");
        result.TotalClinicGrossRevenue.Should().Be(333.33m + 500.55m + 0.01m + 1234.57m);
    }

    [Fact]
    public async Task Verify_Precision_TaxDiscounts_Exact20PercentAnd12PercentVat()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var date = DateTime.UtcNow.Date;

        // Invoice 1: Senior Citizen Gross 1000m, 20% discount = 200m, net = 800m, paid = 800m
        var invSenior = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-TAX-SC",
            InvoiceDate = date,
            PatientId = Guid.NewGuid(),
            PatientName = "Senior Citizen Patient",
            DiscountType = DiscountType.SeniorCitizen,
            DiscountIdNumber = "OSCA-12345",
            DiscountPercentage = 20,
            GrossAmount = 1000m,
            DiscountAmount = 200m,
            NetAmount = 800m,
            AmountPaid = 800m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            Payments = new List<PaymentRecord>
            {
                new()
                {
                    TenantId = _testTenantId,
                    ClinicId = _testClinicId,
                    PaymentNumber = "OR-SC-001",
                    PaymentDate = date,
                    Amount = 800m,
                    Method = PaymentMethod.Cash
                }
            }
        };

        // Invoice 2: PWD Gross 123.45m, 20% discount = 24.69m, net = 98.76m, paid = 98.76m
        var invPwd = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-TAX-PWD",
            InvoiceDate = date,
            PatientId = Guid.NewGuid(),
            PatientName = "PWD Patient",
            DiscountType = DiscountType.Pwd,
            DiscountIdNumber = "PWD-67890",
            DiscountPercentage = 20,
            GrossAmount = 123.45m,
            DiscountAmount = 24.69m,
            NetAmount = 98.76m,
            AmountPaid = 98.76m,
            BalanceDue = 0m,
            Status = InvoiceStatus.Paid,
            Payments = new List<PaymentRecord>
            {
                new()
                {
                    TenantId = _testTenantId,
                    ClinicId = _testClinicId,
                    PaymentNumber = "OR-PWD-002",
                    PaymentDate = date,
                    Amount = 98.76m,
                    Method = PaymentMethod.GCash
                }
            }
        };

        await invoiceRepo.AddAsync(invSenior);
        await invoiceRepo.AddAsync(invPwd);
        await uow.SaveChangesAsync();

        var handler = new GetTaxDiscountAuditReportQueryHandler(invoiceRepo, _clinicContext);
        var result = await handler.Handle(new GetTaxDiscountAuditReportQuery(date.AddDays(-1), date.AddDays(1)), CancellationToken.None);

        result.Should().NotBeNull();
        result.TotalInvoicesAudited.Should().Be(2);

        // Verification of statutory 20% discounts and 12% VAT exemption
        var scRow = result.Items.Single(i => i.InvoiceNumber == "INV-TAX-SC");
        scRow.GrossAmount.Should().Be(1000m);
        scRow.DiscountAmount.Should().Be(200m); // Exact 20%
        scRow.VatAmountExempted.Should().Be(120m); // Exact 12% of 1000m
        scRow.VatExemptSales.Should().Be(1000m);
        scRow.NetAmount.Should().Be(800m);
        scRow.AmountPaid.Should().Be(800m);
        scRow.OfficialReceiptNumber.Should().Be("OR-SC-001");
        scRow.PaymentMethod.Should().Be("Cash");

        var pwdRow = result.Items.Single(i => i.InvoiceNumber == "INV-TAX-PWD");
        pwdRow.GrossAmount.Should().Be(123.45m);
        pwdRow.DiscountAmount.Should().Be(24.69m); // Exact 20% rounded to 2 decimals
        pwdRow.VatAmountExempted.Should().Be(14.81m); // 123.45 * 0.12 = 14.814 -> 14.81m
        pwdRow.VatExemptSales.Should().Be(123.45m);
        pwdRow.NetAmount.Should().Be(98.76m);
        pwdRow.AmountPaid.Should().Be(98.76m);
        pwdRow.OfficialReceiptNumber.Should().Be("OR-PWD-002");
        pwdRow.PaymentMethod.Should().Be("GCash");

        // Grand totals
        result.TotalGrossSales.Should().Be(1123.45m);
        result.TotalSeniorDiscounts.Should().Be(200m);
        result.TotalPwdDiscounts.Should().Be(24.69m);
        result.TotalVatExempted.Should().Be(134.81m); // 120m + 14.81m
        result.TotalNetCollections.Should().Be(898.76m); // 800m + 98.76m
    }

    [Fact]
    public async Task Verify_Precision_WaitAndConsultTimes_ZeroWhenNoWaitsOrConsults_AndAccurateWhenPresent()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);

        var today = DateTime.UtcNow.Date;

        // Part 1: Only Waiting/Triaged patients (no CalledTime, no CompletedTime)
        var qWaiting1 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueNumber = "Q-W1",
            PatientName = "Waiting One",
            CheckInTime = today.AddHours(8),
            CalledTime = null,
            CompletedTime = null,
            Status = QueueStatus.Waiting
        };
        var qWaiting2 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueNumber = "Q-W2",
            PatientName = "Waiting Two",
            CheckInTime = today.AddHours(8).AddMinutes(15),
            CalledTime = null,
            CompletedTime = null,
            Status = QueueStatus.Triaged
        };
        await queueRepo.AddAsync(qWaiting1);
        await queueRepo.AddAsync(qWaiting2);
        await uow.SaveChangesAsync();

        var handler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);

        var resultPart1 = await handler.Handle(new GetClinicAnalyticsQuery(today, today), CancellationToken.None);
        resultPart1.Flow.AverageWaitMinutes.Should().Be(0.0, "Average wait must be genuine 0.0 when no patients were called");
        resultPart1.Flow.AverageConsultMinutes.Should().Be(0.0, "Average consult must be genuine 0.0 when no patients completed consultation");
        resultPart1.Flow.InQueueNow.Should().Be(2);

        // Part 2: Add completed patients with known wait & consult intervals
        // Patient 3: Checkin 09:00, Called 09:07 (wait 7m), Completed 09:22 (consult 15m)
        // Patient 4: Checkin 09:00, Called 09:13 (wait 13m), Completed 09:38 (consult 25m)
        // Expected Average Wait: (7 + 13) / 2 = 10.0m
        // Expected Average Consult: (15 + 25) / 2 = 20.0m
        var qCompleted1 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueNumber = "Q-C1",
            PatientName = "Completed One",
            CheckInTime = today.AddHours(9),
            CalledTime = today.AddHours(9).AddMinutes(7),
            CompletedTime = today.AddHours(9).AddMinutes(22),
            Status = QueueStatus.Completed
        };
        var qCompleted2 = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueNumber = "Q-C2",
            PatientName = "Completed Two",
            CheckInTime = today.AddHours(9),
            CalledTime = today.AddHours(9).AddMinutes(13),
            CompletedTime = today.AddHours(9).AddMinutes(38),
            Status = QueueStatus.Completed
        };
        await queueRepo.AddAsync(qCompleted1);
        await queueRepo.AddAsync(qCompleted2);
        await uow.SaveChangesAsync();

        var resultPart2 = await handler.Handle(new GetClinicAnalyticsQuery(today, today), CancellationToken.None);
        resultPart2.Flow.AverageWaitMinutes.Should().Be(10.0, "Average wait should be precisely 10.0 minutes");
        resultPart2.Flow.AverageConsultMinutes.Should().Be(20.0, "Average consult should be precisely 20.0 minutes");
        resultPart2.Flow.CompletedToday.Should().Be(2);
    }
}
