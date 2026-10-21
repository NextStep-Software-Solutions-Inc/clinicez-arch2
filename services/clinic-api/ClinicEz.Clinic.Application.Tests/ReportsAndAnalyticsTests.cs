using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Reports.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ReportsAndAnalyticsTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-reports-test";

    public ReportsAndAnalyticsTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public async Task GetClinicAnalytics_ShouldReturnTelemetryAndRevenueBreakdown()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);

        var todayMidday = DateTime.UtcNow.Date.AddHours(12);
        // Seed sample queue item
        var qItem = new QueueItem
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(todayMidday),
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Cruz",
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Completed,
            CheckInTime = todayMidday.AddMinutes(-30),
            CalledTime = todayMidday.AddMinutes(-20),
            CompletedTime = todayMidday
        };
        await queueRepo.AddAsync(qItem);

        // Seed invoice
        var invoice = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-20260929-9999",
            InvoiceDate = todayMidday,
            PatientId = qItem.PatientId,
            PatientName = qItem.PatientName,
            GrossAmount = 600m,
            NetAmount = 480m,
            DiscountType = DiscountType.SeniorCitizen,
            DiscountAmount = 120m,
            DiscountPercentage = 20,
            BalanceDue = 0m,
            AmountPaid = 480m,
            Status = InvoiceStatus.Paid,
            LineItems = new List<InvoiceLineItem>
            {
                new() { DoctorName = "Dr. Cruz", Description = "Consultation", Category = "Consultation", UnitPrice = 600m, TotalPrice = 600m }
            }
        };
        await invoiceRepo.AddAsync(invoice);

        // Seed payment
        var payment = new PaymentRecord
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceId = invoice.Id,
            PaymentNumber = "OR-20260929-9999",
            PaymentDate = DateTime.UtcNow,
            Amount = 480m,
            Method = PaymentMethod.Cash
        };
        await paymentRepo.AddAsync(payment);
        await uow.SaveChangesAsync();

        var handler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);

        var result = await handler.Handle(new GetClinicAnalyticsQuery(), CancellationToken.None);

        result.Should().NotBeNull();
        result.TotalGrossRevenue.Should().Be(600m);
        result.TotalNetRevenue.Should().Be(480m);
        result.TotalCollections.Should().Be(480m);
        result.SeniorDiscountsGiven.Should().Be(120m);
        result.Flow.TotalEncountersToday.Should().Be(1);
        result.Flow.CompletedToday.Should().Be(1);
        result.TenderShares.Should().Contain(t => t.Method == "Cash" && t.TotalAmount == 480m);
    }

    [Fact]
    public async Task GetMorbidityReport_ShouldAggregateICD10DiagnosesWithDemographics()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patient = new ClinicPatient
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-2026-99901",
            FirstName = "Lourdes",
            LastName = "Velasco",
            DateOfBirth = new DateOnly(1950, 1, 1), // Senior
            Gender = "Female",
            CivilStatus = "Married",
            ContactNumber = "09170001111",
            AddressLine = "Street 1",
            Barangay = "Brgy 1",
            City = "Manila",
            Province = "Metro Manila",
            EmergencyContactName = "Son",
            EmergencyContactPhone = "09180002222",
            EmergencyContactRelationship = "Child"
        };
        await patientRepo.AddAsync(patient);

        var encounter = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            PatientName = "Lourdes Velasco",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Cruz",
            EncounterDate = DateTime.UtcNow,
            Subjective = "Persistent elevated BP",
            Assessment = "Hypertension Stage 2",
            Diagnoses = new List<EncounterDiagnosis>
            {
                new()
                {
                    Icd10Code = "I10",
                    Description = "Essential (Primary) Hypertension",
                    IsPrimary = true
                }
            }
        };
        await consultRepo.AddAsync(encounter);
        await uow.SaveChangesAsync();

        var handler = new GetMorbidityReportQueryHandler(consultRepo, patientRepo, _clinicContext);
        var result = await handler.Handle(new GetMorbidityReportQuery(), CancellationToken.None);

        result.Should().NotBeNull();
        result.Diseases.Should().Contain(d => d.Icd10Code == "I10" && d.SeniorCases >= 1 && d.FemaleCases >= 1);
    }

    [Fact]
    public async Task GetTaxDiscountAuditReport_ShouldAuditSeniorAndPwdInvoices()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var invoice = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-20260929-0010",
            InvoiceDate = DateTime.UtcNow,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            GrossAmount = 1000m,
            DiscountType = DiscountType.SeniorCitizen,
            DiscountIdNumber = "SC-9999-1234",
            DiscountPercentage = 20,
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
                    PaymentNumber = "OR-20260929-0010",
                    PaymentDate = DateTime.UtcNow,
                    Amount = 800m,
                    Method = PaymentMethod.Cash
                }
            }
        };
        await invoiceRepo.AddAsync(invoice);
        await uow.SaveChangesAsync();

        var handler = new GetTaxDiscountAuditReportQueryHandler(invoiceRepo, _clinicContext);
        var result = await handler.Handle(new GetTaxDiscountAuditReportQuery(), CancellationToken.None);

        result.Should().NotBeNull();
        result.Items.Should().Contain(i => i.InvoiceNumber == "INV-20260929-0010"
                                           && i.IdentificationCardNumber == "SC-9999-1234"
                                           && i.GrossAmount == 1000m
                                           && i.DiscountAmount == 200m
                                           && i.VatAmountExempted == 120m
                                           && i.OfficialReceiptNumber == "OR-20260929-0010");
    }

    [Fact]
    public async Task GetDoctorSharesReport_ShouldCalculatePhysicianAndFacilityShares()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var docId = Guid.NewGuid();
        var enc = new ConsultationEncounter
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient A",
            DoctorId = docId,
            DoctorName = "Dr. Juan Reyes",
            EncounterDate = DateTime.UtcNow,
            Subjective = "Fever and cough",
            Assessment = "URTI"
        };
        await consultRepo.AddAsync(enc);

        var inv = new Invoice
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            InvoiceNumber = "INV-20260929-0020",
            InvoiceDate = DateTime.UtcNow,
            PatientId = enc.PatientId,
            PatientName = enc.PatientName,
            AttendingDoctorId = docId,
            GrossAmount = 1000m,
            NetAmount = 1000m,
            Status = InvoiceStatus.Paid,
            LineItems = new List<InvoiceLineItem>
            {
                new()
                {
                    DoctorId = docId,
                    DoctorName = "Dr. Juan Reyes",
                    Description = "Specialist Consultation",
                    Category = "Consultation",
                    UnitPrice = 600m,
                    Quantity = 1,
                    TotalPrice = 600m
                },
                new()
                {
                    DoctorId = docId,
                    DoctorName = "Dr. Juan Reyes",
                    Description = "Nebulization Session",
                    Category = "Procedure",
                    UnitPrice = 400m,
                    Quantity = 1,
                    TotalPrice = 400m
                }
            }
        };
        await invoiceRepo.AddAsync(inv);
        await uow.SaveChangesAsync();

        var handler = new GetDoctorSharesReportQueryHandler(consultRepo, invoiceRepo, procRepo, _clinicContext);
        var result = await handler.Handle(new GetDoctorSharesReportQuery(), CancellationToken.None);

        result.Should().NotBeNull();
        result.DoctorShares.Should().Contain(d => d.DoctorName == "Dr. Juan Reyes"
                                                  && d.TotalGrossGenerated == 1000m
                                                  && d.EstimatedPhysicianShare == 700m
                                                  && d.ClinicFacilityShare == 300m);
    }

    [Fact]
    public async Task GetClinicAnalytics_EmptyDataset_ShouldReturnZeroesAndEmptyLists()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);

        var handler = new GetClinicAnalyticsQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext);

        var result = await handler.Handle(new GetClinicAnalyticsQuery(), CancellationToken.None);

        result.Should().NotBeNull();
        result.TotalGrossRevenue.Should().Be(0m);
        result.TotalNetRevenue.Should().Be(0m);
        result.TotalCollections.Should().Be(0m);
        result.TotalUnpaidBalances.Should().Be(0m);
        result.AverageTicketSize.Should().Be(0m);
        result.SeniorDiscountsGiven.Should().Be(0m);
        result.PwdDiscountsGiven.Should().Be(0m);
        result.Flow.TotalEncountersToday.Should().Be(0);
        result.Flow.CompletedToday.Should().Be(0);
        result.Flow.AverageWaitMinutes.Should().Be(0.0);
        result.Flow.AverageConsultMinutes.Should().Be(0.0);
        result.TopDiagnoses.Should().BeEmpty();
        result.TopServices.Should().BeEmpty();
        result.DoctorStats.Should().BeEmpty();
        result.TenderShares.Should().BeEmpty();
    }

    [Fact]
    public async Task GetDailyEodReport_EmptyDataset_ShouldReturnZeroCensusAndBalances()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var paymentRepo = TestDbHelper.CreateRepository<PaymentRecord>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var handler = new GetDailyEodReportQueryHandler(
            queueRepo, invoiceRepo, paymentRepo, consultRepo, procRepo, labRepo, _clinicContext, settingsRepo);

        var result = await handler.Handle(new GetDailyEodReportQuery(DateTime.UtcNow.Date), CancellationToken.None);

        result.Should().NotBeNull();
        result.TotalCheckedIn.Should().Be(0);
        result.TotalWalkIns.Should().Be(0);
        result.TotalAppointments.Should().Be(0);
        result.TotalCompletedVisits.Should().Be(0);
        result.TotalWaitingOrInConsultation.Should().Be(0);
        result.TotalGrossAmount.Should().Be(0m);
        result.TotalDiscountsGiven.Should().Be(0m);
        result.TotalSeniorDiscounts.Should().Be(0m);
        result.TotalPwdDiscounts.Should().Be(0m);
        result.TotalPhilHealthCovered.Should().Be(0m);
        result.TotalNetAmount.Should().Be(0m);
        result.TotalAmountCollected.Should().Be(0m);
        result.CashInDrawer.Should().Be(0m);
        result.TotalUnpaidBalances.Should().Be(0m);
        result.CollectionsByMethod.Should().BeEmpty();
        result.DoctorWorkloads.Should().BeEmpty();
        result.TotalProceduresPerformed.Should().Be(0);
        result.TotalLabOrdersIssued.Should().Be(0);
        result.TotalPrescriptionsWritten.Should().Be(0);
        result.TotalDangerousDrugPrescriptions.Should().Be(0);
    }

    [Fact]
    public async Task GetMorbidityReport_EmptyDataset_ShouldReturnEmptyDiseasesAndRealClinicName()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "St. Jude Family Clinic"
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var handler = new GetMorbidityReportQueryHandler(consultRepo, patientRepo, _clinicContext, settingsRepo);
        var result = await handler.Handle(new GetMorbidityReportQuery(), CancellationToken.None);

        result.Should().NotBeNull();
        result.TotalEncountersReviewed.Should().Be(0);
        result.TotalDiagnosesRecorded.Should().Be(0);
        result.Diseases.Should().BeEmpty();
        result.ClinicName.Should().Be("St. Jude Family Clinic");
    }

    [Fact]
    public async Task GetTaxDiscountAuditReport_EmptyDataset_ShouldReturnEmptyItemsAndZeroTotals()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var handler = new GetTaxDiscountAuditReportQueryHandler(invoiceRepo, _clinicContext);
        var result = await handler.Handle(new GetTaxDiscountAuditReportQuery(), CancellationToken.None);

        result.Should().NotBeNull();
        result.TotalInvoicesAudited.Should().Be(0);
        result.TotalGrossSales.Should().Be(0m);
        result.TotalSeniorDiscounts.Should().Be(0m);
        result.TotalPwdDiscounts.Should().Be(0m);
        result.TotalVatExempted.Should().Be(0m);
        result.TotalNetCollections.Should().Be(0m);
        result.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task GetDoctorSharesReport_EmptyDataset_ShouldReturnEmptyDoctorSharesAndZeroRevenue()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var settings = new ClinicSettings
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "General Clinic",
            DefaultDoctorSharePercentage = 0.75m
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var handler = new GetDoctorSharesReportQueryHandler(consultRepo, invoiceRepo, procRepo, _clinicContext, settingsRepo);
        var result = await handler.Handle(new GetDoctorSharesReportQuery(), CancellationToken.None);

        result.Should().NotBeNull();
        result.TotalClinicEncounters.Should().Be(0);
        result.TotalClinicGrossRevenue.Should().Be(0m);
        result.TotalPhysicianShares.Should().Be(0m);
        result.TotalFacilityShares.Should().Be(0m);
        result.DoctorShares.Should().BeEmpty();
    }
}
